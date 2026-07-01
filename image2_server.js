const express = require('express');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

function mapAspectRatioToSize(aspectRatio) {
  switch (String(aspectRatio || '').trim()) {
    case '9:16':
      return '1024x1536';
    case '16:9':
      return '1536x1024';
    case '1:1':
    default:
      return '1024x1024';
  }
}

function buildPrompt(prompt, negativePrompt) {
  const positive = String(prompt || '').trim();
  const negative = String(negativePrompt || '').trim();

  if (!negative) return positive;

  return [
    positive,
    '',
    'Avoid the following in the generated image:',
    negative,
  ].join('\n');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/image2-generate', async (req, res) => {
  try {
    const { prompt, negative_prompt, aspect_ratio } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OPENAI_API_KEY is not set on the server.',
      });
    }

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        error: 'prompt is required.',
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const mergedPrompt = buildPrompt(prompt, negative_prompt);
    const size = mapAspectRatioToSize(aspect_ratio);

    const result = await client.images.generate({
      model: 'gpt-image-1',
      prompt: mergedPrompt,
      size,
      n: 1,
    });

    const firstImage = result?.data?.[0];

    if (!firstImage?.b64_json) {
      return res.status(502).json({
        error: 'OpenAI did not return b64_json.',
        raw: result,
      });
    }

    return res.json({
      data: [
        {
          b64_json: firstImage.b64_json,
        },
      ],
    });
  } catch (error) {
    console.error(error);
    console.error(error.response?.data);

    const status = error?.status || error?.response?.status || 500;
    const message =
      error?.response?.data?.error?.message ||
      error?.message ||
      'Image generation failed.';

    return res.status(status).json({
      error: message,
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'short_video_prompt_builder.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'short_video_prompt_builder.html'));
});

app.listen(PORT, () => {
  console.log(`Image API server is running on http://localhost:${PORT}`);
});
