FROM techsophyofficial/python:v3.12.3
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid 1001 --create-home appuser
WORKDIR /app
COPY requirements.txt .
RUN python -m pip install --upgrade pip
RUN pip install -r requirements.txt
COPY . .
RUN chown appuser:appuser /app
USER appuser
EXPOSE 5000
CMD ["python", "server.py"]
