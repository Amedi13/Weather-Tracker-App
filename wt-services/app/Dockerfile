# backend: wt-services/app/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Copy requirements first (leverages Docker layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the rest of the source
COPY . .



# Start server (project name clarified below)
CMD ["gunicorn", "--chdir", "/app", "app.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3"]
