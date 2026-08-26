FROM python:3.9-slim

# Install system dependencies required for audio processing
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    espeak-ng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code

# Copy requirements and install them
COPY requirenments.txt .
RUN pip install --no-cache-dir -r requirenments.txt

# Pre-download Whisper model as fallback (primary transcription uses Groq Cloud API)
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', compute_type='int8')"

# Copy the rest of the application code
COPY . .

# Set up permissions for Hugging Face Spaces
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

COPY --chown=user . $HOME/app

# Expose port 7860 as required by Hugging Face Spaces
EXPOSE 7860

# Command to run the FastAPI app via Uvicorn (2 workers for pilot concurrency)
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers 2 --timeout-keep-alive 30"
