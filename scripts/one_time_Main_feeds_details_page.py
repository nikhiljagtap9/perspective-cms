import sys
import json
import asyncio
import logging
import random
from datetime import datetime
from collections import defaultdict
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from prisma import Prisma
from tqdm.asyncio import tqdm_asyncio
from tqdm import tqdm

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
MAX_URL_CONCURRENCY = 100  # raised for speed

country_semaphore = asyncio.Semaphore(MAX_COUNTRY_CONCURRENCY)
url_semaphore = asyncio.Semaphore(MAX_URL_CONCURRENCY)

# ----------------------------
# HTTP Client with Pool Limits
# ----------------------------
client = httpx.AsyncClient(
    timeout=httpx.Timeout(6.0),  # ⏳ faster fail
    follow_redirects=True,
    headers={"User-Agent": random.choice(USER_AGENTS)},
    limits=httpx.Limits(
        max_connections=300,
        max_keepalive_connections=100,
        keepalive_expiry=30.0,
    ),
)

# ----------------------------
# Retry Wrapper
# ----------------------------
async def fetch_with_retry(url, retries=1):
    """Simple wrapper for GET with 1 retry"""
    for attempt in range(retries + 1):
        try:
            return await client.get(url)
        except Exception as e:
            if attempt == retries:
                logging.error(f"[FAILED] {url} → {e}")
                return None
            await asyncio.sleep(1)

# ----------------------------
# Clean Image URLs
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
                image_id = after_upload[-1]
                width_transform = None
                for part in after_upload[:-1]:
                    if part.startswith("w_"):
                        width_transform = part
                if width_transform:
                    return f"{parsed.scheme}://{parsed.netloc}/image/upload/{width_transform}/{image_id}"
        return img_url
    except Exception:
        return img_url

# ----------------------------
# Skip Menu & Social Links
# ----------------------------
def should_skip_link(link: str, tag=None) -> bool:
    skip_patterns = [
        "about", "contact", "privacy", "terms", "advertise", "sitemap", "category",
        "facebook.com", "twitter.com", "instagram.com", "youtube.com", "linkedin.com",
        "login", "signup", "subscribe", "register", "account", "faq",
    ]

    # 1. Pattern-based skip
    if any(p in link.lower() for p in skip_patterns):
        return True

    # 2. Too short → usually home or menu
    if len(link.split("/")) <= 3:
        return True

    if tag:
        # 3. Look at the tag itself
        parent_classes = " ".join(tag.get("class", [])).lower()
        parent_id = (tag.get("id") or "").lower()

        block_keywords = ["nav", "menu", "header", "footer", "sidebar", "widget", "trending", "related"]
        if any(x in parent_classes for x in block_keywords):
            return True
        if any(x in parent_id for x in block_keywords):
            return True

        # 4. Walk up the DOM tree → skip if inside nav/footer/sidebar/etc.
        for parent in tag.parents:
            if not getattr(parent, "get", None):
                continue
            classes = " ".join(parent.get("class", [])).lower()
            pid = (parent.get("id") or "").lower()
            if any(x in classes for x in block_keywords):
                return True
            if any(x in pid for x in block_keywords):
                return True

    return False


# ----------------------------
# Domain Failure Tracker
# ----------------------------
domain_failures = defaultdict(int)
FAIL_THRESHOLD = 1  # stop after 3 failures

def is_domain_blocked(domain: str) -> bool:
    return domain_failures[domain] >= FAIL_THRESHOLD

# ----------------------------
# Scrape Details Page
# ----------------------------
async def scrape_details_page(article_url: str, keywords: list[str], favicon_url: str, parsed_domain: str, country_name: str) -> dict:
    domain = urlparse(article_url).netloc

    if is_domain_blocked(domain):
        logging.warning(f"[{country_name}][{domain}] Blocked → skipping {article_url}")
        return {}

    async with url_semaphore:
        try:
            r = await fetch_with_retry(article_url)
            if not r or r.status_code != 200:
                domain_failures[domain] += 1
                if is_domain_blocked(domain):
                    logging.error(f"[{country_name}][{domain}] Blocked after {FAIL_THRESHOLD} failures")
                return {}

            soup = BeautifulSoup(r.text, "html.parser")

            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else ""
            paragraphs = [p.get_text(strip=True) for p in soup.find_all("p") if p.get_text(strip=True)]
            content_text = " ".join(paragraphs)

            full_context = f"{title} {content_text}".lower()
            if not any(word.lower() in full_context for word in keywords):
                return {}

            img_url = ""
            og_img = soup.find("meta", property="og:image")
            if og_img and og_img.get("content"):
                img_url = clean_image_url(urljoin(article_url, og_img["content"].strip()))

            author, pub_date = "", ""
            author_tag = soup.find("meta", attrs={"name": "author"})
            if author_tag and author_tag.get("content"):
                author = author_tag["content"]
            pub_tag = soup.find("meta", property="article:published_time")
            if pub_tag and pub_tag.get("content"):
                pub_date = pub_tag["content"]

            pub_time = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")

            return {
                "title": title,
                "description": content_text[:500],
                "link": article_url,
                "guid": {"isPermaLink": True, "value": article_url},
                "dc:creator": parsed_domain,
                "pubDate": pub_time,
                "thumbnails": favicon_url,
                "thumbnail_url": img_url,
                "content_text": content_text[:2000],
                "author": author,
                "published_time": pub_date,
            }
        except Exception as e:
            domain_failures[domain] += 1
            logging.error(f"[{country_name}] [DETAILS FAILED] {article_url} → {e} (fail {domain_failures[domain]}/{FAIL_THRESHOLD})")
            if is_domain_blocked(domain):
                logging.error(f"[{country_name}][{domain}] Blocked after {FAIL_THRESHOLD} failures")
            return {}

# ----------------------------
# Scrape Articles (Homepage → Details)
# ----------------------------
async def scrape_articles(url: str, html: str, keywords: list[str], country_name: str):
    articles, seen_links = [], set()
    soup = BeautifulSoup(html, "html.parser")

    favicon_url = ""
    icon_link = soup.find("link", rel=lambda v: v and "icon" in v.lower())
    if icon_link and icon_link.has_attr("href"):
        favicon_url = urljoin(url, icon_link["href"])

    parsed_domain = urlparse(url).netloc

    links = []
    for a in soup.find_all("a", href=True):
        link = a["href"]
        if not link.startswith("http"):
            link = url.rstrip("/") + "/" + link.lstrip("/")
        if link not in seen_links and not should_skip_link(link, a):
            seen_links.add(link)
            links.append(link)

    # 🔹 Skip blocked domains
    filtered_links = [l for l in links if not is_domain_blocked(urlparse(l).netloc)]

    with tqdm(total=len(filtered_links), desc=f"{country_name} details", leave=False) as pbar:
        detail_tasks = [scrape_details_page(link, keywords, favicon_url, parsed_domain, country_name) for link in filtered_links]
        for coro in asyncio.as_completed(detail_tasks):
            try:
                result = await coro
                if isinstance(result, dict) and result:
                    articles.append(result)
            except Exception as e:
                logging.error(f"[{country_name}] detail scrape error: {e}")
            finally:
                pbar.update(1)

    return articles

# ----------------------------
# Scrape Country
# ----------------------------
async def scrape_country(db: Prisma, country, sources_by_country, keywords_by_country):
    async with country_semaphore:
        urls = sources_by_country.get(country.id, [])
        keywords = keywords_by_country.get(country.id, [])
        if not urls or not keywords:
            return 0

        all_articles = []
        tasks = [client.get(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(results):
            url = urls[i]
            if isinstance(result, Exception) or not result or result.status_code != 200:
                logging.error(f"[{country.name}] {url} failed")
                continue
            articles = await scrape_articles(url, result.text, keywords, country.name)
            all_articles.extend(articles)

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

        saved_row = await db.scrapperdata.find_unique(
            where={"country_id_feed_type": {"country_id": country.id, "feed_type": "MAIN_FEED"}}
        )
        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={"content": json.dumps(rss_json, ensure_ascii=False), "updated_at": datetime.now()},
            )
        else:
            await db.scrapperdata.create(
                data={"country_id": country.id, "feed_type": "MAIN_FEED", "content": json.dumps(rss_json, ensure_ascii=False)}
            )

        logging.info(f"[{country.name}] {len(all_articles)} articles fetched")
        return len(all_articles)

# ----------------------------
# Main Runner
# ----------------------------
# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    countries = await db.country.find_many()
    sources = await db.newssource.find_many()
    keywords = await db.keyword.find_many()

    sources_by_country, keywords_by_country = {}, {}
    for s in sources:
        sources_by_country.setdefault(s.countryId, []).append(s.url)
    for k in keywords:
        parts = [kw.strip() for kw in k.keyword.split(",") if kw.strip()]
        keywords_by_country.setdefault(k.countryId, []).extend(parts)

    results = []
    # 🔹 Add country-level progress bar
    with tqdm(total=len(countries), desc="Scraping countries") as country_bar:
        tasks = [scrape_country(db, country, sources_by_country, keywords_by_country) for country in countries]
        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
                results.append(result)
            except Exception as e:
                logging.error(f"Country scrape error: {e}")
            finally:
                country_bar.update(1)

    total = sum(r for r in results if isinstance(r, int))
    logging.info(f"SUMMARY: Total {total} articles saved across {len(countries)} countries")

    await db.disconnect()
    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
