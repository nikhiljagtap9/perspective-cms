import os
import json
import logging
import traceback
import datetime
import pytz
import asyncio
from dotenv import load_dotenv
from openai import OpenAI
from prisma import Prisma

# ----------------------------
# Config
# ----------------------------
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

API_HITS = 0
FEED_TYPE = "DAILY_SUMMARY"

# ----------------------------
# Logging setup
# ----------------------------
LOG_FILE = "daily_summary.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()  # also print to console
    ]
)

# ----------------------------
# Save logs to FeedLog table
# ----------------------------
async def save_log(db: Prisma, feed_type: str, url: str, data: dict, status: str):
    try:
        await db.feedlog.create(
            data={
                "feed_type": feed_type,
                "url": url,
                "response": json.dumps(data, ensure_ascii=False),
                "status": status,
            }
        )
    except Exception as e:
        logging.error(f"⚠️ Failed to log in FeedLog: {e}")

# ----------------------------
# Generate AI Summary
# ----------------------------
async def generate_summary(country_name: str):
    global API_HITS

    ist = pytz.timezone("Asia/Kolkata")
    now_ist = datetime.datetime.now(ist)
    today_ist = now_ist.strftime("%d %b %y")   # Example: "25 Sep 25"

    # Define timestamps in IST and GMT
    timestamp_ist = now_ist.strftime("%H:%M IST")
    timestamp_gmt = datetime.datetime.now(datetime.UTC).strftime("%H:%M GMT")

    prompt = f"""
You are a research assistant tasked with generating a SAME-DAY daily media summary 
for {country_name}, dated {today_ist} (IST).

Sources Allowed:
Only {country_name}-origin media outlets when available.
⚠️ If {country_name} has no major outlets in the approved list, default to these for India:
- The Hindu, Hindustan Times, Indian Express, Times of India, Deccan Herald, Mint, Business Standard, ANI, PTI

Topics to Include:
- Politics
- Foreign policy & geopolitics
- Security & terrorism
- Economy & finance

Topics to Exclude:
- Entertainment
- Sports
- Lifestyle
- Minor local stories

📰 Output Format
Headline: {country_name}: Daily Media Summary [{today_ist}]

Timestamp: Generated at {timestamp_ist} / {timestamp_gmt}

Validation Line: Timestamp validated against system clock: YES

📌 Content Sections
Highlights:
- Provide 3-6 short one-line bullet points (no trailing full stops)

Detailed Summary:
- Provide 3-5 concise sections
- Each section must:
  • Begin with the topic or headline
  • Summarize the issue factually in ~2 sentences
  • End with explicit source attribution in this format: (Source: [Name](URL))

Style:
- Neutral, factual tone
- Use US spelling where relevant
- Keep focus only on same-day developments
"""

    API_HITS += 1
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a research assistant providing reliable OSINT embassy monitoring summaries."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.2,
    )

    return response.choices[0].message.content

# ----------------------------
# Save to scrapperdata
# ----------------------------
async def save_summary(db: Prisma, country, summary: str):
    try:
        rss_json = {
            "channel": {
                "title": f"{country.name} Daily Summary Feed",
                "description": f"Daily summary for {country.name}",
                "link": "",
                "items": [
                    {
                        "title": f"{country.name} Daily Summary",
                        "description": summary
                    }
                ],
                "meta": {
                    "status": "success" if summary else "empty",
                    "api_hits": API_HITS,
                },
                "image": {
                    "url": "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
                    "title": f"{country.name} Daily Summary",
                    "link": "",
                }
            }
        }

        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "feed_type": FEED_TYPE}
        )

        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.datetime.now(datetime.UTC),
                }
            )
        else:
            await db.scrapperdata.create(
                data={
                    "feed_type": FEED_TYPE,
                    "country_id": country.id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logging.info(f"[{FEED_TYPE}][{country.name}] saved successfully")
        await save_log(db, FEED_TYPE, f"/daily-summary/{country.id}", rss_json, "success")
        return True

    except Exception as e:
        logging.error(f"[{FEED_TYPE}][{country.name}] failed: {e}")
        traceback.print_exc()
        await save_log(db, FEED_TYPE, f"/daily-summary/{country.id}", {"error": str(e)}, "error")
        return False

# ----------------------------
# Main runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()


    # Fetch ALL countries dynamically

    countries = await db.country.find_many()
    for country in countries:
        try:
            summary = await generate_summary(country.name)
            await save_summary(db, country, summary)
        except Exception as e:
            logging.error(f"[{FEED_TYPE}][{country.name}] Exception: {e}")
            traceback.print_exc()
            await save_log(db, FEED_TYPE, f"/daily-summary/{country.id}", {"error": str(e)}, "error")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
