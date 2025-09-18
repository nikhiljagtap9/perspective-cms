import sys
import json
import cloudscraper
import requests
from bs4 import BeautifulSoup
from datetime import datetime
from prisma import Prisma
import asyncio
import logging
import traceback
import random
import xml.etree.ElementTree as ET

# ----------------------------
# User Agents
# ----------------------------
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/116.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0 Safari/537.36 Edg/117.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) Version/16.0 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 6 Pro) Chrome/117.0 Mobile Safari/537.36",
]

# ----------------------------
# Logging config
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler(sys.stdout)
    ]
)

# ----------------------------
# Helpers
# ----------------------------
def get_browser_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }


def fetch_page(url: str):
    """Fetch page content, retry HTTPS if HTTP fails"""
    headers = get_browser_headers()

    def try_request(u: str):
        try:
            scraper = cloudscraper.create_scraper()
            response = scraper.get(u, headers=headers, timeout=15)
            response.raise_for_status()
            return response.text, None
        except Exception as e1:
            logging.warning(f"cloudscraper failed for {u}: {e1} (falling back to requests)")
            try:
                response = requests.get(u, headers=headers, timeout=15)
                response.raise_for_status()
                return response.text, None
            except Exception as e2:
                logging.error(f"requests failed for {u}: {e2}")
                return None, str(e2)

    html, error = try_request(url)

    if not html and url.startswith("http://"):
        https_url = url.replace("http://", "https://", 1)
        logging.info(f"Retrying with HTTPS: {https_url}")
        html, error = try_request(https_url)

    return html, error


def try_rss_feed(url: str):
    """Try fetching RSS/Atom feed endpoints"""
    feed_endpoints = [
        "/rss",
        "/rss.xml",
        "/feed",
        "/feed.xml",
        "/feeds",
        "/atom.xml",
        "/api/rss",
    ]

    for suffix in feed_endpoints:
        feed_url = url.rstrip("/") + suffix
        html, error = fetch_page(feed_url)
        if not html:
            continue

        try:
            root = ET.fromstring(html)
            items = []

            # RSS 2.0 <item>
            for item in root.findall(".//item"):
                title = item.findtext("title")
                link = item.findtext("link")
                pub_date = item.findtext("pubDate") or datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
                if title and link:
                    items.append({
                        "title": title,
                        "description": item.findtext("description") or title,
                        "link": link,
                        "guid": {"isPermaLink": True, "value": link},
                        "dc:creator": "rss",
                        "pubDate": pub_date,
                    })

            # Atom <entry>
            for entry in root.findall(".//{http://www.w3.org/2005/Atom}entry"):
                title = entry.findtext("{http://www.w3.org/2005/Atom}title")
                link_elem = entry.find("{http://www.w3.org/2005/Atom}link")
                link = link_elem.attrib.get("href") if link_elem is not None else None
                pub_date = entry.findtext("{http://www.w3.org/2005/Atom}updated") or datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
                if title and link:
                    items.append({
                        "title": title,
                        "description": title,
                        "link": link,
                        "guid": {"isPermaLink": True, "value": link},
                        "dc:creator": "atom",
                        "pubDate": pub_date,
                    })

            if items:
                logging.info(f"✅ Found RSS feed at {feed_url} ({len(items)} items)")
                return items, None
        except Exception:
            continue

    return None, "No valid RSS feed"


def scrape_articles(url: str, keywords: list[str]):
    """Scrape and filter articles by keywords.
    - Try HTML first.
    - If HTML fails (error) → try RSS.
    - If HTML works but finds no matches → return empty (skip RSS).
    """

    # --- 1. Try HTML first ---
    html, error = fetch_page(url)
    if html:
        soup = BeautifulSoup(html, "html.parser")
        articles = []

        for a in soup.find_all("a", href=True):
            title = a.get_text(strip=True)
            link = a["href"]

            if not title or len(title.split()) <= 3:
                continue

            if not link.startswith("http"):
                link = url.rstrip("/") + "/" + link.lstrip("/")

            pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

            if not any(word.lower() in title.lower() for word in keywords):
                continue

            articles.append({
                "title": title,
                "description": title,
                "link": link,
                "guid": {"isPermaLink": True, "value": link},
                "dc:creator": "scraper",
                "pubDate": pub_time,
            })

        # ✅ Return results (even if empty) → DO NOT try RSS if HTML worked
        return articles, None

    # --- 2. If HTML failed → fallback to RSS ---
    try:
        rss_items, rss_error = try_rss_feed(url)
        if rss_items:
            return rss_items, None
        else:
            return [], rss_error or error or "No valid RSS fields found"
    except Exception as rss_ex:
        return [], f"RSS error: {rss_ex} | HTML error: {error}"

# ----------------------------
# Scrape per country
# ----------------------------
async def scrape_country(db: Prisma, country_id: str, country_name: str):
    try:
        sources = await db.newssource.find_many(where={"countryId": country_id})
        urls = [s.url for s in sources]

        if not urls:
            logging.warning(f"No sources for {country_name} ({country_id})")
            return 0

        keywords = await db.keyword.find_many(where={"countryId": country_id})
        keyword_list = [k.keyword for k in keywords]

        if not keyword_list:
            logging.warning(f"No keywords for {country_name} ({country_id})")
            return 0

        total_articles = 0

        for url in urls:
            articles = []
            error_reason = None
            try:
                articles, error_reason = scrape_articles(url, keyword_list)
            except Exception as e:
                error_reason = str(e)
                logging.error(f"Scraping failed for {url} in {country_name}: {e}")
                traceback.print_exc()

            if not articles and not error_reason:
                logging.warning(f"Fetched {url} but no articles matched for {country_name}")

            status = "success" if articles else ("error" if error_reason else "empty")

            rss_json = {
                "channel": {
                    "title": "Main Feed",
                    "description": f"Scraped Main Feed articles for {country_name} ({url})",
                    "link": url,
                    "generator": "Custom Python Scraper",
                    "lastBuildDate": datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT"),
                    "language": "en",
                    "items": articles,
                    "meta": {
                        "status": status,
                        "reason": error_reason,
                        "article_count": len(articles),
                    },
                }
            }

            await db.scrapperdata.create(
                data={
                    "url": url,
                    "feed_type": "MAIN_FEED",
                    "country_id": country_id,
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

            logging.info(f"[{country_name}] {url} → {status} ({len(articles)} articles)")

            total_articles += len(articles)

        return total_articles

    except Exception as e:
        logging.error(f"Fatal error processing {country_name} ({country_id}): {e}")
        traceback.print_exc()
        return 0


# ----------------------------
# Main runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    countries = await db.country.find_many()
    total_articles = 0

    chunk_size = 10
    for i in range(0, len(countries), chunk_size):
        chunk = countries[i : i + chunk_size]
        logging.info(f"Processing countries {i+1} to {i+len(chunk)} of {len(countries)}")

        for country in chunk:
            count = await scrape_country(db, country.id, country.name)
            total_articles += count

    await db.disconnect()
    logging.info(f"SUMMARY: Total {total_articles} articles saved across {len(countries)} countries")


if __name__ == "__main__":
    asyncio.run(main())
