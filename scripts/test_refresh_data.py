import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util
spec = importlib.util.spec_from_file_location(
    "refresh_data", os.path.join(os.path.dirname(os.path.abspath(__file__)), "refresh-data.py")
)
refresh_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh_data)

filter_and_rank_global_rows = refresh_data.filter_and_rank_global_rows
RANKING_CROPS = refresh_data.RANKING_CROPS
GLOBAL_AGGREGATES = refresh_data.GLOBAL_AGGREGATES
FAOSTAT_NAMES = refresh_data.FAOSTAT_NAMES
YEAR_END = refresh_data.YEAR_END


def make_row(area, item, element_code, m49, **year_vals):
    row = {
        "Area": area,
        "Item": item,
        "Element Code": element_code,
        "Area Code (M49)": m49,
    }
    for year, val in year_vals.items():
        row[year] = str(val)
    return row


class TestFilterAndRankGlobalRows(unittest.TestCase):
    def test_ranks_countries_by_latest_production_descending(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2023=3000000, Y2024=3200000),
            make_row("Vietnam", "Coffee, green", "5510", "'704", Y2023=1800000, Y2024=1900000),
            make_row("Colombia", "Coffee, green", "5510", "'170", Y2023=800000, Y2024=850000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        coffee = result["Coffee"]
        self.assertEqual([r["country"] for r in coffee], ["Brazil", "Vietnam", "Colombia"])
        self.assertEqual([r["rank"] for r in coffee], [1, 2, 3])

    def test_skips_continental_and_world_aggregates(self):
        rows = [
            make_row("World", "Coffee, green", "5510", "'001", Y2024=10000000),
            make_row("Americas", "Coffee, green", "5510", "'019", Y2024=6000000),
            make_row("European Union (27)", "Coffee, green", "5510", "'097", Y2024=0),
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        countries = [r["country"] for r in result["Coffee"]]
        self.assertEqual(countries, ["Brazil"])

    def test_only_keeps_launch_crops(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
            make_row("France", "Sorghum", "5510", "'250", Y2024=100000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIn("Coffee", result)
        self.assertNotIn("Sorghum", result)

    def test_attaches_iso3_code_for_known_african_countries_only(self):
        rows = [
            make_row("Ethiopia", "Coffee, green", "5510", "'231", Y2024=500000),
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
        ]
        africa_countries = {"Ethiopia": {"code": "ETH", "region": "East Africa"}}
        result = filter_and_rank_global_rows(rows, africa_countries=africa_countries)
        by_country = {r["country"]: r for r in result["Coffee"]}
        self.assertEqual(by_country["Ethiopia"]["code"], "ETH")
        self.assertIsNone(by_country["Brazil"]["code"])

    def test_computes_year_over_year_percent_change(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2023=3000000, Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertAlmostEqual(result["Coffee"][0]["yoy_pct"], 10.0, places=1)

    def test_yoy_is_none_when_prior_year_missing(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIsNone(result["Coffee"][0]["yoy_pct"])

    def test_caps_at_top_30_countries_per_crop(self):
        rows = [
            make_row(f"Country{i}", "Coffee, green", "5510", f"'{i:03d}", Y2024=1000 - i)
            for i in range(40)
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertEqual(len(result["Coffee"]), 30)
        self.assertEqual(result["Coffee"][0]["country"], "Country0")

    def test_includes_yield_and_area_alongside_production(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),  # production, tonnes
            make_row("Brazil", "Coffee, green", "5412", "'076", Y2024=850),      # yield, kg/ha
            make_row("Brazil", "Coffee, green", "5312", "'076", Y2024=3800),     # area, ha
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        row = result["Coffee"][0]
        self.assertEqual(row["production"], 3200.0)   # tonnes / 1000
        self.assertEqual(row["yield"], 8500)           # kg/ha * 10 -> hg/ha
        self.assertEqual(row["area"], 3.8)             # ha / 1000

    def test_excludes_china_aggregate_keeps_china_mainland(self):
        rows = [
            make_row("China", "Wheat", "5510", "'156", Y2024=140105000),
            make_row("China, mainland", "Wheat", "5510", "'041", Y2024=140100000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        countries = [r["country"] for r in result["Wheat"]]
        self.assertEqual(countries, ["China, mainland"])

    def test_excludes_data_entirely_outside_recency_window(self):
        stale_year = YEAR_END - 10
        rows = [
            make_row("USSR", "Wheat", "5510", "'810", **{f"Y{stale_year}": 71991000}),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertNotIn("Wheat", result)

    def test_remaps_raw_faostat_name_to_display_name_for_africa_lookup(self):
        rows = [
            make_row("Côte d'Ivoire", "Cocoa beans", "5510", "'384", Y2024=2200000),
        ]
        africa_countries = {"Ivory Coast": {"code": "CIV", "region": "West Africa"}}
        result = filter_and_rank_global_rows(rows, africa_countries=africa_countries)
        row = result["Cocoa"][0]
        self.assertEqual(row["country"], "Ivory Coast")
        self.assertEqual(row["code"], "CIV")

    def test_yoy_is_none_when_prior_production_is_exactly_zero(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2023=0, Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIsNone(result["Coffee"][0]["yoy_pct"])

    def test_yoy_is_none_when_prior_production_is_missing_entirely(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIsNone(result["Coffee"][0]["yoy_pct"])


if __name__ == "__main__":
    unittest.main()
