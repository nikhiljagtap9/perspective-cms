import sys
import json
import asyncio
import logging
import traceback
import random
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from prisma import Prisma
from tqdm.asyncio import tqdm_asyncio

# ----------------------------
# User Agents
# ----------------------------
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/116.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 6 Pro) Chrome/117.0 Mobile Safari/537.36",
]

# ----------------------------
# Logging
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler("us_mentions.log"), logging.StreamHandler(sys.stdout)],
)

# ----------------------------
# HTTP Client
# ----------------------------
client = httpx.AsyncClient(
    timeout=8, follow_redirects=True,
    headers={"User-Agent": random.choice(USER_AGENTS)}
)

# ----------------------------
# Fetch Page
# ----------------------------
async def fetch_page(url: str):
    try:
        r = await client.get(url)
        r.raise_for_status()
        return r.text, None
    except Exception as e:
        return None, str(e)

# ----------------------------
# Scrape Articles
# ----------------------------
def scrape_articles(url: str, html: str, keywords: list[str], country_name: str):
    articles = []
    soup = BeautifulSoup(html, "html.parser")

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")

        # Filter: must match keyword OR country name
        title_lower = title.lower()
        if not (
            any(word.lower() in title_lower for word in keywords)
            or country_name.lower() in title_lower
        ):
            continue

        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
        articles.append({
            "title": title,
            "description": title,
            "link": link,
            "guid": {"isPermaLink": True, "value": link},
            "dc:creator": "scraper",
            "pubDate": pub_time,
        })
    return articles

# ----------------------------
# Scrape Single (Source + Country)
# ----------------------------
async def scrape_us_mentions(db: Prisma, source, country, keywords: list[str]):
    url = source.url
    try:
        html, error = await fetch_page(url)
        articles = scrape_articles(url, html, keywords, country.name) if html else []

        status = "success" if articles else ("error" if error else "empty")

        rss_json = {
            "channel": {
                "title": "US Mentions Feed",
                "description": f"Scraped US mentions for {country.name} ({url})",
                "link": url,
                "items": articles,
                "meta": {
                    "status": status,
                    "reason": error,
                    "article_count": len(articles),
                },
            }
        }

        # 🔹 Try to find an existing row
        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "url": url, "feed_type": "US_MENTIONS"}
        )

        if saved_row:
            # 🔹 Update existing
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.now(),
                }
            )
        else:
            # 🔹 Create new
            await db.scrapperdata.create(
                data={
                    "url": url,
                    "feed_type": "US_MENTIONS",
                    "country_id": country.id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logging.info(f"[US_MENTIONS][{country.name}] {url} → {status} ({len(articles)} articles)")
        return len(articles)

    except Exception as e:
        logging.error(f"[US_MENTIONS][{country.name}] {url} failed: {e}")
        traceback.print_exc()
        return 0

# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    countries = await db.country.find_many()
    us_sources = await db.usmentionssource.find_many()
    us_keywords = await db.usmentionskeyword.find_many()

    keywords_by_country = {}
    for k in us_keywords:
        keywords_by_country.setdefault(k.countryId, []).append(k.keyword)

    tasks = []
    for country in countries:
        keywords = keywords_by_country.get(country.id, [])
        if not keywords:
            continue
        for source in us_sources:
            tasks.append(scrape_us_mentions(db, source, country, keywords))

    results = await tqdm_asyncio.gather(*tasks, total=len(tasks), desc="Scraping US Mentions")

    total = sum(r for r in results if isinstance(r, int))
    logging.info(f"SUMMARY: US_MENTIONS={total}")

    await db.disconnect()
    await client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
