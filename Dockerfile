FROM node:22-bookworm-slim
WORKDIR /crawler
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV DOCUMENT_PYTHON=/opt/doc-reader/bin/python
COPY package.json package-lock.json ./
COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr tesseract-ocr-eng poppler-utils \
    && python3 -m venv /opt/doc-reader && /opt/doc-reader/bin/pip install --no-cache-dir -r requirements.txt \
    && npm ci --omit=dev && npx playwright install --with-deps chromium \
    && mkdir -p /crawler/storage && chown -R node:node /crawler && chmod -R a+rX /ms-playwright
COPY --chown=node:node src ./src
ENV CRAWLER_STORAGE_DIR=/crawler/storage
USER node
VOLUME ["/crawler/storage"]
CMD ["npm", "run", "crawl"]
