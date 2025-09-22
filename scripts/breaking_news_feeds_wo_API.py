import asyncio
import datetime
import html
import json
import logging
import traceback
from playwright.async_api import async_playwright
from prisma import Prisma

# ----------------------------
# Logging
# ----------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("breaking_news.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)

# ----------------------------
# Breaking News Sources (Name → Handle + Keyword)
# ----------------------------
SOURCES = {
    "India": {"handle": "ndtv", "keyword": "#BREAKING"},
    "Israel": {"handle": "N12News", "keyword": "#BREAKING"},
    "Belarus": {"handle": "Pozirk_online", "keyword": "Belarus"},
    "Iraq": {"handle": "SHAFAQNEWSENG", "keyword": "#Iraq"},
    "Saudi Arabia": {"handle": "Saudi_Gazette", "keyword": "#BREAKING"},
    "Cameroon": {"handle": "TheCameroonianZ", "keyword": "#Cameroon"},
    "Qatar": {"handle": "dohanews", "keyword": "#Qatar"},
    "China": {"handle": "ChinaDaily", "keyword": "China"},
}

# ----------------------------
# Fetch Tweets with Playwright
# ----------------------------
async def get_tweets(username: str, keyword: str, limit: int = 10):
    url = f"https://twitter.com/{username.lstrip('@')}"
    tweets_data = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url, timeout=60000, wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)

        # Scroll to load more
        for _ in range(3):
            await page.mouse.wheel(0, 2000)
            await page.wait_for_timeout(2000)

        tweets = await page.query_selector_all("article")
        for tweet in tweets:
            if len(tweets_data) >= limit:
                break

            text_elem = await tweet.query_selector("div[lang]")
            text = await text_elem.inner_text() if text_elem else "[No text]"

            # ✅ only breaking news relevant tweets
            if keyword.lower() not in text.lower():
                continue

            time_elem = await tweet.query_selector("time")
            date_time = await time_elem.get_attribute("datetime") if time_elem else datetime.datetime.utcnow().isoformat()

            link_elem = await tweet.query_selector("a time")
            link = ""
            if link_elem:
                link = await link_elem.evaluate("el => el.parentElement.href")

            img_elems = await tweet.query_selector_all("img")
            image_urls = []
            for img in img_elems:
                src = await img.get_attribute("src")
                if src and "profile_images" not in src and "emoji" not in src:
                    image_urls.append(src)

            tweets_data.append({
                "title": text[:50] + "..." if len(text) > 50 else text,
                "link": link if link else url,
                "pubDate": date_time,
                "description": text,
                "images": image_urls
            })

        await browser.close()

    return tweets_data


# ----------------------------
# Scrape & Save Per Country
# ----------------------------
async def scrape_country_breaking(db: Prisma, country, handle: str, keyword: str):
    try:
        tweets = await get_tweets(handle, keyword, limit=10)

        rss_json = {
            "channel": {
                "title": f"{country.name} Breaking News Feed",
                "description": f"Breaking news tweets from {handle}",
                "link": f"https://twitter.com/{handle}",
                "items": tweets,
                "meta": {
                    "status": "success" if tweets else "empty",
                    "tweet_count": len(tweets),
                },
                "image": {
                    "url": "https://abs.twimg.com/icons/apple-touch-icon-192x192.png",
                    "title": f"{country.name} Breaking News",
                    "link": f"https://twitter.com/{handle}",
                }
            }
        }

        # Save / update ScrapperData
        saved_row = await db.scrapperdata.find_first(
            where={"country_id": country.id, "feed_type": "BREAKING_NEWS"}
        )

        if saved_row:
            await db.scrapperdata.update(
                where={"id": saved_row.id},
                data={
                    "content": json.dumps(rss_json, ensure_ascii=False),
                    "updated_at": datetime.datetime.now(),
                }
            )
        else:
            await db.scrapperdata.create(
                data={
                    "feed_type": "BREAKING_NEWS",
                    "country_id": country.id,   # ✅ real DB id
                    "content": json.dumps(rss_json, ensure_ascii=False),
                }
            )

        logging.info(f"[BREAKING_NEWS][{country.name}] → {len(tweets)} tweets saved")
        return len(tweets)

    except Exception as e:
        logging.error(f"[BREAKING_NEWS][{country.name}] failed: {e}")
        traceback.print_exc()
        return 0


# ----------------------------
# Main Runner
# ----------------------------
async def main():
    db = Prisma()
    await db.connect()

    total = 0
    for country_name, info in SOURCES.items():
        # ✅ resolve real country from DB
        country = await db.country.find_first(where={"name": country_name})
        if not country:
            logging.warning(f"⚠️ Country '{country_name}' not found in DB")
            continue

        count = await scrape_country_breaking(db, country, info["handle"], info["keyword"])
        total += count

    logging.info(f"SUMMARY: BREAKING_NEWS={total} tweets merged across {len(SOURCES)} countries")

    await db.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
