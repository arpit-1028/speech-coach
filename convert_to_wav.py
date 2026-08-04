from pydub import AudioSegment

def convert(mp3_file):
    sound = AudioSegment.from_mp3(mp3_file)
    wav_file = mp3_file.replace(".mp3", ".wav")
    sound.export(wav_file, format="wav")
    print(f"Converted: {wav_file}")

files = ["dog.mp3", "cat.mp3", "pen.mp3", "bat.mp3", "ten.mp3"]

for f in files:
    convert(f)