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
    seen_links = set()   # Track duplicates by link
    soup = BeautifulSoup(html, "html.parser")

    # --- Find site logo ---
    site_logo = None

    # Try favicon
    icon = soup.find("link", rel=lambda v: v and "icon" in v.lower())
    if icon and icon.get("href"):
        site_logo = icon["href"]

    # Try og:image
    if not site_logo:
        og_img = soup.find("meta", property="og:image")
        if og_img and og_img.get("content"):
            site_logo = og_img["content"]

    # Try <img> with logo in class/id
    if not site_logo:
        logo_img = soup.find("img", {"class": lambda v: v and "logo" in v.lower()})
        if not logo_img:
            logo_img = soup.find("img", {"id": lambda v: v and "logo" in v.lower()})
        if logo_img and logo_img.get("src"):
            site_logo = logo_img["src"]

    # Fix relative URL
    if site_logo and not site_logo.startswith("http"):
        site_logo = url.rstrip("/") + "/" + site_logo.lstrip("/")

    # --- Collect articles ---
    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")

        # Skip duplicates
        if link in seen_links:
            continue
        seen_links.add(link)    

        # Collect context for keyword matching
        context_parts = [title]

        parent = a.find_parent()
        if parent:
            # Nearby <p> tags
            p_tags = parent.find_all("p", limit=3)
            for p in p_tags:
                context_parts.append(p.get_text(strip=True))

            # Image alt text
            img = parent.find("img")
            if img and img.has_attr("alt"):
                context_parts.append(img["alt"])

        full_context = " ".join(context_parts).lower()

        # --- Keyword filter ---
        if not (
            any(word.lower() in full_context for word in keywords)
            or country_name.lower() in full_context
        ):
            continue

        # Build article
        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
        article = {
            "title": title,
            "description": " ".join(context_parts)[:500],
            "link": link,
            "guid": {"isPermaLink": True, "value": link},
            "dc:creator": "scraper",
            "pubDate": pub_time,
        }
        articles.append(article)

    return articles, site_logo

# ----------------------------
# Scrape Single (Source + Country)
# ----------------------------
# ----------------------------
# Scrape All Sources for One Country (US Mentions)
# ----------------------------
async def scrape_us_mentions_country(db: Prisma, country, sources, keywords: list[str]):
    all_articles = []
    site_logo = None

    for source in sources:
        url = source.url
        try:
            html, error = await fetch_page(url)
            if not html:
                logging.warning(f"[US_MENTIONS][{country.name}] {url} failed: {error}")
                continue

            articles, logo = scrape_articles(url, html, keywords, country.name)
            all_articles.extend(articles)

            if logo and not site_logo:  # take first found logo
                site_logo = logo

        except Exception as e:
            logging.error(f"[US_MENTIONS][{country.name}] {url} exception: {e}")
            traceback.print_exc()

    # Build combined feed JSON
    status = "success" if all_articles else "empty"
    rss_json = {
        "channel": {
            "title": "US Mentions Feed",
            "description": f"Scraped US mentions for {country.name}",
            "link": None,
            "items": all_articles,
            "meta": {
                "status": status,
                "article_count": len(all_articles),
            },
        }
    }

    # Add site logo once
    if site_logo:
        rss_json["channel"]["image"] = {
            "url": site_logo,
            "title": f"{country.name} Feed",
            "link": sources[0].url if sources else None,
        }

    # Save / update DB (one row per country + feed_type)
    saved_row = await db.scrapperdata.find_first(
        where={"country_id": country.id, "feed_type": "US_MENTIONS"}
    )

    if saved_row:
        await db.scrapperdata.update(
            where={"id": saved_row.id},
            data={
                "content": json.dumps(rss_json, ensure_ascii=False),
                "updated_at": datetime.now(),
            }
        )
    else:
        await db.scrapperdata.create(
            data={
                "feed_type": "US_MENTIONS",
                "country_id": country.id,
                "content": json.dumps(rss_json, ensure_ascii=False),
            }
        )

    logging.info(f"[US_MENTIONS][{country.name}] → {status} ({len(all_articles)} articles)")
    return len(all_articles)

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
        tasks.append(scrape_us_mentions_country(db, country, us_sources, keywords))

    results = await tqdm_asyncio.gather(*tasks, total=len(tasks), desc="Scraping US Mentions")

    total = sum(r for r in results if isinstance(r, int))
    logging.info(f"SUMMARY: US_MENTIONS={total}")

    await db.disconnect()
    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
