import asyncio
import logging
import random
import httpx
from bs4 import BeautifulSoup

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/116.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:116.0) Gecko/20100101 Firefox/116.0",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.FileHandler("scraper.log"), logging.StreamHandler()]
)

async def test_one_url(url: str):
    async with httpx.AsyncClient(
        timeout=10,
        headers={"User-Agent": random.choice(USER_AGENTS)},
        follow_redirects=True
    ) as client:
        logging.info(f"Fetching {url} ...")
        r = await client.get(url)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        logging.info("==== PAGE HTML PREVIEW ====")
        logging.info(soup.prettify())  # log first 2000 chars only
        logging.info("==== END PREVIEW ====")

if __name__ == "__main__":
    asyncio.run(test_one_url("https://shabait.com"))
