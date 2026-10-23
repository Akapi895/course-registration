FROM python:3.12-slim
WORKDIR /workspace
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY database/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY database /workspace/database
ENTRYPOINT ["python", "database/tools/manage.py"]
