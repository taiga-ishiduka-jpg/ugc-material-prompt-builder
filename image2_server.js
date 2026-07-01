const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/static', express.static(__dirname));

function mapAspectRatioToSize(aspectRatio) {
  const value = String(aspectRatio || 'auto').trim().toLowerCase();

  switch (value) {
    case '1:1':
    case 'square':
      return '1024x1024';
    case '9:16':
    case 'portrait':
    case '3:4':
    case '2:3':
      return '1024x1536';
    case '16:9':
    case 'landscape':
    case '4:3':
    case '3:2':
      return '1536x1024';
    case 'auto':
    default:
      return '1024x1024';
  }
}

function buildImagePrompt(prompt, negativePrompt, aspectRatio) {
  const safePrompt = String(prompt || '').trim();
  const safeNegative = String(negativePrompt || '').trim();
  const safeAspect = String(aspectRatio || 'auto').trim();

  const sections = [safePrompt];

  if (safeNegative) {
    sections.push(`Avoid the following: ${safeNegative}.`);
  }

  if (safeAspect && safeAspect !== 'auto') {
    sections.push(`Compose the image for an aspect ratio of ${safeAspect}.`);
  }

  return sections.join('\n\n');
}

app.post('/api/image2-generate', async (req, res) => {
  try {
    const { prompt, negative_prompt, aspect_ratio } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server.' });
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'prompt is required.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const finalPrompt = buildImagePrompt(prompt, negative_prompt, aspect_ratio);
    const size = mapAspectRatioToSize(aspect_ratio);

    const result = await client.images.generate({
      model: 'gpt-image-1',
      prompt: finalPrompt,
      size,
      n: 1
    });

    const data = Array.isArray(result?.data) ? result.data : [];
    const b64Items = data.filter(item => item && item.b64_json).map(item => ({ b64_json: item.b64_json }));
    const urlItems = data.filter(item => item && item.url).map(item => ({ url: item.url }));

    if (b64Items.length > 0) {
      return res.json({ data: b64Items });
    }

    if (urlItems.length > 0) {
      return res.json({ images: urlItems });
    }

    return res.status(502).json({ error: 'Image API returned no usable image data.', raw: result });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    const message = error && error.message ? error.message : 'Unknown server error';

    return res.status(status).json({
      error: 'image_generation_failed',
      message
    });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'short_video_prompt_builder.html'));
});

app.get('/app', (_req, res) => {
  res.sendFile(path.join(__dirname, 'short_video_prompt_builder.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Image API server running on http://localhost:${port}`);
  });
}

module.exports = app;
