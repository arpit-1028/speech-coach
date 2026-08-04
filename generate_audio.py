from gtts import gTTS

def generate(word):
    tts = gTTS(text=word, lang='en')
    filename = f"{word}.mp3"
    tts.save(filename)
    print(f"Saved: {filename}")

# words to test
words = ["dog", "cat", "pen", "bat", "ten"]

for w in words:
    generate(w)