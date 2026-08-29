"""Compute summary statistics and outlier explanations from the SYNTHETIC
per-contract dataset in data/contracts.json, and write site/data/stats.json
for the static dashboard to fetch at runtime.

No LLM call, no external API: outlier explanations are pure deterministic
string templating from computed statistics.

Run: python3 data/compute_stats.py
Output: site/data/stats.json (committed to the repo)
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

OUTLIER_Z_THRESHOLD = 1.5

REAL_CITED = {
    "n_contracts": 61,
    "denial_rate_range": [1.9, 24.6],
    "appeal_overturn_rate": 94.6,
    "source": (
        "Healthcare Dive reporting on Centene Corporation CY2025 CMS-0057-F "
        "public disclosures, as aggregated by AuthDenied (2026)."
    ),
}


def build_explanation(contract_id: str, state: str, rate: float, median: float, z: float) -> str:
    delta = round(abs(rate - median), 1)
    direction = "above" if rate >= median else "below"
    return (
        f"Contract {contract_id} in {state} denies {rate}% of MA prior-auth "
        f"requests, {delta} points {direction} the Centene-wide median of "
        f"{median}% — a {abs(round(z, 1))}-sigma outlier within this "
        f"synthetic reconstruction."
    )


def main() -> None:
    data_dir = Path(__file__).parent
    site_data_dir = data_dir.parent / "site" / "data"
    site_data_dir.mkdir(parents=True, exist_ok=True)

    raw = json.loads((data_dir / "contracts.json").read_text())
    df = pd.DataFrame(raw["contracts"])

    median = df["denial_rate"].median()
    mean = df["denial_rate"].mean()
    std = df["denial_rate"].std(ddof=0)

    df["z_score"] = (df["denial_rate"] - median) / std
    df["is_outlier"] = df["z_score"].abs() > OUTLIER_Z_THRESHOLD
    df["z_score"] = df["z_score"].round(2)

    df["explanation"] = None
    outlier_mask = df["is_outlier"]
    df.loc[outlier_mask, "explanation"] = df.loc[outlier_mask].apply(
        lambda row: build_explanation(
            row["contract_id"], row["state"], row["denial_rate"], round(median, 1), row["z_score"]
        ),
        axis=1,
    )

    total_filed = int(df["appeals_filed"].sum())
    total_overturned = int(df["appeals_overturned"].sum())
    aggregate_overturn_rate = round(total_overturned / total_filed * 100, 1)

    summary = {
        "n_contracts": len(df),
        "median_denial_rate": round(median, 1),
        "mean_denial_rate": round(mean, 2),
        "std_denial_rate": round(std, 2),
        "min_denial_rate": round(df["denial_rate"].min(), 1),
        "max_denial_rate": round(df["denial_rate"].max(), 1),
        "total_appeals_filed": total_filed,
        "total_appeals_overturned": total_overturned,
        "aggregate_appeal_overturn_rate": aggregate_overturn_rate,
        "n_outliers": int(outlier_mask.sum()),
        "outlier_z_threshold": OUTLIER_Z_THRESHOLD,
    }

    output = {
        "meta": {
            **raw["meta"],
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "real_cited": REAL_CITED,
        },
        "summary": summary,
        "contracts": json.loads(df.to_json(orient="records")),
    }

    out_path = site_data_dir / "stats.json"
    out_path.write_text(json.dumps(output, indent=2) + "\n")

    print(f"median denial rate: {summary['median_denial_rate']}%")
    print(f"outliers flagged: {summary['n_outliers']} (|z| > {OUTLIER_Z_THRESHOLD})")
    print(f"aggregate overturn rate: {summary['aggregate_appeal_overturn_rate']}%")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
