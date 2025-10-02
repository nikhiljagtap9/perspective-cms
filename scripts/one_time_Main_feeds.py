import sys
import json
import asyncio
import logging
import random
import re
from datetime import datetime
from dotenv import load_dotenv
import httpx
from bs4 import BeautifulSoup
from prisma import Prisma
from tqdm.asyncio import tqdm_asyncio
from urllib.parse import urljoin, urlparse

load_dotenv()
# ----------------------------
# User Agents
# ----------------------------
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Chrome/116.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) "
    "Gecko/20100101 Firefox/116.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Safari/537.36 Edg/117.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/16.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; Pixel 6 Pro) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/117.0 Mobile Safari/537.36",
]

# ----------------------------
# Logging
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler("scraper.log", mode="w", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)

# ----------------------------
# Concurrency
# ----------------------------
MAX_COUNTRY_CONCURRENCY = 5
MAX_URL_CONCURRENCY = 20
MAX_DB_CONCURRENCY = 2  # 🔹 limit DB connections

country_semaphore = asyncio.Semaphore(MAX_COUNTRY_CONCURRENCY)
url_semaphore = asyncio.Semaphore(MAX_URL_CONCURRENCY)
db_semaphore = asyncio.Semaphore(MAX_DB_CONCURRENCY)

# ----------------------------
# Safe DB wrapper
# ----------------------------
async def safe_db_call(func, *args, **kwargs):
    async with db_semaphore:
        return await func(*args, **kwargs)

# ----------------------------
# HTTP Client
# ----------------------------
client = httpx.AsyncClient(
    timeout=8, follow_redirects=True, headers={"User-Agent": random.choice(USER_AGENTS)}
)

# ----------------------------
# Retry wrapper
# ----------------------------
async def with_retries(coro_func, *args, retries=3, **kwargs):
    for attempt in range(1, retries + 1):
        try:
            return await coro_func(*args, **kwargs)
        except Exception as e:
            if attempt == retries:
                logging.error(f"Failed after {retries} retries: {e}")
                return None
            await asyncio.sleep(1 * attempt)

# ----------------------------
# Image cleaner
# ----------------------------
def clean_image_url(img_url: str) -> str:
    if not img_url:
        return ""
    try:
        parsed = urlparse(img_url)
        path_parts = parsed.path.split("/")
        if "upload" in path_parts:
            idx = path_parts.index("upload")
            after_upload = path_parts[idx + 1 :]
            if len(after_upload) >= 2:
                transforms = ",".join(after_upload[:-1])
                image_id = after_upload[-1]
                width_transform = None
                for part in transforms.split(","):
                    if part.strip().startswith("w_"):
                        width_transform = part.strip()
                if width_transform:
                    return f"{parsed.scheme}://{parsed.netloc}/image/upload/{width_transform}/{image_id}"
        return img_url
    except Exception:
        return img_url

# ----------------------------
# Keyword Matcher
# ----------------------------
def keyword_match(full_context: str, keywords: list[str]) -> bool:
    """
    Return True if a keyword is found in the context as a proper word,
    but skip cases like US$ / US€ (currencies).
    """
    for word in keywords:
        pattern = r"\b" + re.escape(word) + r"\b"
        for match in re.finditer(pattern, full_context, flags=re.IGNORECASE):
            after = full_context[match.end():match.end()+1]
            if after in ["$", "€"]:
                continue
            return True
    return False

# ----------------------------
# Fetch Page
# ----------------------------
async def fetch_page(url: str, saved_etag: str = None, saved_lastmod: str = None):
    headers = {}
    if saved_etag:
        headers["If-None-Match"] = saved_etag
    if saved_lastmod:
        headers["If-Modified-Since"] = saved_lastmod

    try:
        r = await client.get(url, headers=headers)
        if r.status_code == 304:
            logging.info(f"[SKIP] {url} → Not Modified (304)")
            return None, "not_modified", None, None
        if r.status_code != 200:
            logging.error(f"[HTTP ERROR] {url} → {r.status_code} {r.reason_phrase}")
        r.raise_for_status()
        return r.text, None, r.headers.get("ETag"), r.headers.get("Last-Modified")
    except Exception as e:
        logging.error(f"[REQUEST FAILED] {url} → {e}")
        return None, str(e), None, None

# ----------------------------
# OG Image
# ----------------------------
async def get_og_image(article_url: str) -> str:
    try:
        r = await client.get(article_url, timeout=8)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            og_tag = soup.find("meta", property="og:image")
            if og_tag and og_tag.get("content"):
                raw_url = urljoin(article_url, og_tag["content"].strip())
                return clean_image_url(raw_url)
    except Exception:
        return ""
    return ""

# ----------------------------
# Scrape Articles
# ----------------------------
async def scrape_articles(url: str, html: str, keywords: list[str], country_name: str):
    articles = []
    seen_links = set()
    soup = BeautifulSoup(html, "html.parser")

    favicon_url = ""
    icon_link = soup.find("link", rel=lambda v: v and "icon" in v.lower())
    if icon_link and icon_link.has_attr("href"):
        favicon_url = urljoin(url, icon_link["href"])

    parsed_domain = urlparse(url).netloc

    tasks = []
    temp_articles = []

    for a in soup.find_all("a", href=True):
        title = a.get_text(strip=True)
        link = a["href"]

        if not title or len(title.split()) <= 3:
            continue
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")

        if link in seen_links:
            continue
        seen_links.add(link)

        context_parts = [title]

        parent = a.find_parent()
        if parent:
            for p in parent.find_all("p", limit=3):
                text = p.get_text(strip=True)
                if text:
                    context_parts.append(text)
            img = parent.find("img")
            if img and img.has_attr("alt") and img["alt"].strip():
                context_parts.append(img["alt"].strip())

        full_context = " ".join(context_parts).lower()
        if not keyword_match(full_context, keywords):
            continue

        pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

        article = {
            "title": title,
            "description": " ".join(context_parts)[:500],
            "link": link,
            "guid": {"isPermaLink": True, "value": link},
            "dc:creator": parsed_domain,
            "pubDate": pub_time,
            "thumbnails": favicon_url,
            "thumbnail_url": "",
        }

        temp_articles.append(article)
        tasks.append(with_retries(get_og_image, link))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for article, og_img in zip(temp_articles, results):
        if isinstance(og_img, str) and og_img:
            article["thumbnail_url"] = og_img
        articles.append(article)

    return articles

# ----------------------------
# Scrape Single Country
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])

        if not urls or not keywords:
            return 0

        all_articles = []

        tasks = [fetch_page(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            url = urls[i]
            if isinstance(result, Exception):
                logging.error(f"[{country.name}] {url} failed: {result}")
                continue

            html, error_reason, _, _ = result
            if error_reason:
                logging.error(f"[{country.name}] ERROR from {url}: {error_reason}")
                continue

            if html:
                try:
                    articles = await scrape_articles(url, html, keywords, country.name)
                    all_articles.extend(articles)
                except Exception as e:
                    logging.error(f"[{country.name}] scrape_articles failed for {url}: {e}")

        status = "success" if all_articles else "empty"
        rss_json = {
            "channel": {
                "title": "Main Feed",
                "description": f"Scraped articles for {country.name}",
                "link": None,
                "items": all_articles,
                "meta": {"status": status, "article_count": len(all_articles)},
            }
        }

        saved_row = await safe_db_call(
            db.scrapperdata.find_unique,
            where={"country_id_feed_type": {"country_id": country.id, "feed_type": "MAIN_FEED"}}
        )

        if saved_row:
            await safe_db_call(
                db.scrapperdata.update,
                where={"id": saved_row.id},
                data={"content": json.dumps(rss_json, ensure_ascii=False), "updated_at": datetime.now()},
            )
        else:
            await safe_db_call(
                db.scrapperdata.create,
                data={"country_id": country.id, "feed_type": "MAIN_FEED", "content": json.dumps(rss_json, ensure_ascii=False)}
            )

        logging.info(f"[{country.name}] {len(all_articles)} articles fetched")
        return len(all_articles)

# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    try:
        await db.connect()

        countries = await safe_db_call(db.country.find_many)
        sources = await safe_db_call(db.newssource.find_many)
        keywords = await safe_db_call(db.keyword.find_many)

        sources_by_country = {}
        for s in sources:
            sources_by_country.setdefault(s.countryId, []).append(s.url)

        keywords_by_country = {}
        for k in keywords:
            parts = [kw.strip() for kw in k.keyword.split(",") if kw.strip()]
            keywords_by_country.setdefault(k.countryId, []).extend(parts)

        tasks = [scrape_country(db, country, sources_by_country, keywords_by_country) for country in countries]
        results = await tqdm_asyncio.gather(*tasks, total=len(tasks), desc="Scraping countries")

        for country, result in zip(countries, results):
            if isinstance(result, int):
                logging.info(f"--> {country.name}: {result} articles")

        total = sum(r for r in results if isinstance(r, int))
        logging.info(f"SUMMARY: Total {total} articles saved across {len(countries)} countries")

    finally:
        await db.disconnect()
        await client.aclose()

if __name__ == "__main__":
    asyncio.run(main())
