# Generates sample HubSpot import CSVs with deliberate, realistic data-quality
# issues baked in — the whole point is an audit with real findings, not a
# suspiciously clean demo dataset.
import csv
import random
from datetime import date, timedelta

random.seed(7)

OUT = r"c:\Users\Administrator\Documents\Marcus\Portfolio\hubspot-crm-audit\data"

industries = ["Manufacturing", "Construction", "Hospitality", "Healthcare Services", "Retail", "Professional Services"]
company_names = [
    "Coastal Kitchens", "Northgate HVAC", "SteelForm Inc", "PrimeCut Metals", "Lakewood Hotels",
    "Apex Fabrication", "BuildRight Co", "Sunrise Dental Group", "Harborview Logistics", "Metro Print Solutions",
    "Cedarline Furniture", "Bright Path Clinics", "Ironclad Roofing", "Willow Creek Bakery", "Vantage Consulting",
    "Redstone Realty", "Bluewave Marine", "Foothill Landscaping", "Anchor Legal Group", "Summit Fitness Studios",
]

companies = []
for i, name in enumerate(company_names, start=1):
    companies.append({
        "company_id": f"C{1000+i}",
        "name": name,
        "domain": name.lower().replace(" ", "") + ".example.com",
        "industry": random.choice(industries),
        "city": random.choice(["Austin", "Denver", "Portland", "Nashville", "Raleigh", "Tampa"]),
    })
# Duplicate finding: same company entered twice with slightly different name/domain
companies.append({
    "company_id": "C1099",
    "name": "Coastal Kitchen",  # missing the 's' — a duplicate-entry issue
    "domain": "coastalkitchens.example.com",
    "industry": "Hospitality",
    "city": "Tampa",
})

with open(f"{OUT}/companies.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=companies[0].keys())
    w.writeheader()
    w.writerows(companies)

first_names = ["Jordan", "Casey", "Morgan", "Taylor", "Riley", "Avery", "Cameron", "Drew", "Reese", "Sawyer",
               "Alex", "Jamie", "Quinn", "Skyler", "Rowan", "Emerson", "Finley", "Hayden", "Kendall", "Peyton"]
last_names = ["Nguyen", "Patel", "Garcia", "Kim", "Johnson", "Rossi", "Muller", "Okafor", "Sato", "Weber",
              "Brooks", "Diaz", "Fischer", "Hale", "Iverson", "Jansen", "Kowalski", "Lund", "Mora", "Novak"]
titles = ["Owner", "Operations Manager", "Office Manager", "General Manager", "Director", ""]  # blank title = missing-property finding

contacts = []
cid = 1
for c in companies[:19]:  # first 19 real companies get 2-3 contacts each
    for _ in range(random.randint(2, 3)):
        fn, ln = random.choice(first_names), random.choice(last_names)
        email = f"{fn.lower()}.{ln.lower()}@{c['domain']}"
        contacts.append({
            "contact_id": f"P{2000+cid}",
            "first_name": fn,
            "last_name": ln,
            "email": email,
            "phone": f"555-01{cid:02d}" if cid % 5 != 0 else "",  # some missing phone
            "job_title": random.choice(titles),
            "company_id": c["company_id"],
            "lifecycle_stage": random.choice(["subscriber", "lead", "marketingqualifiedlead", "opportunity", "customer"]),
        })
        cid += 1

# Duplicate-contact finding: same person entered twice (typo'd email)
contacts.append({
    "contact_id": "P2099",
    "first_name": "Jordan", "last_name": "Nguyen",
    "email": "jordan.nguyen@coastalkitchens.example.con",  # .con typo
    "phone": "555-0101", "job_title": "Owner",
    "company_id": "C1001", "lifecycle_stage": "customer",
})
# A contact with NO email at all — required-property finding
contacts.append({
    "contact_id": "P2098",
    "first_name": "Casey", "last_name": "Patel",
    "email": "", "phone": "555-0177", "job_title": "Manager",
    "company_id": "C1005", "lifecycle_stage": "lead",
})

with open(f"{OUT}/contacts.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=contacts[0].keys())
    w.writeheader()
    w.writerows(contacts)

stages = ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "decisionmakerboughtin", "contractsent", "closedwon", "closedlost"]
deals = []
start = date(2026, 4, 1)
for i in range(1, 11):
    company = random.choice(companies[:19])
    stage = random.choice(stages)
    created = start + timedelta(days=random.randint(0, 100))
    has_close_date = i % 4 != 0  # deal 4, 8 have no close date -> finding
    deals.append({
        "deal_id": f"D{3000+i}",
        "deal_name": f"{company['name']} — {random.choice(['Onboarding', 'Expansion', 'Renewal', 'New Install'])}",
        "company_id": company["company_id"],
        "amount": random.choice([2500, 4800, 6200, 9100, 12500, 18000]),
        "stage": stage,
        "create_date": created.isoformat(),
        "close_date": (created + timedelta(days=random.randint(20, 60))).isoformat() if has_close_date else "",
        "last_activity_date": (created + timedelta(days=random.randint(1, 15))).isoformat() if i != 6 else "",  # deal 6 stale, no activity
    })

with open(f"{OUT}/deals.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=deals[0].keys())
    w.writeheader()
    w.writerows(deals)

print(f"companies: {len(companies)}, contacts: {len(contacts)}, deals: {len(deals)}")
print(f"written to {OUT}")
