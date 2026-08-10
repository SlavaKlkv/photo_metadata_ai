from pathlib import Path

ADOBE_RESTRICTED_TERMS_FILE = (
    Path(__file__).resolve().parents[2]
    / 'data'
    / 'stock_validation'
    / 'adobe'
    / 'restricted_terms.v1.json'
)
