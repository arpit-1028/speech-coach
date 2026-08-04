import edge_tts

async def generate_audio(text):

    communicate = edge_tts.Communicate(
        text,
        "en-US-AriaNeural"
    )

    await communicate.save("output.mp3")

    return "output.mp3"