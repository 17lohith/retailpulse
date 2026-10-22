# Containerised function (also usable as a Cloud Run service with an Eventarc trigger)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY etl.py main.py ./
ENV PORT=8080
CMD ["functions-framework", "--target=on_upload", "--signature-type=cloudevent", "--port=8080"]
