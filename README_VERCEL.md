# Deployment Instructions

## Vercel Deployment

This project is configured for deployment on Vercel using Vite.

### Prerequisites
1. A GitHub repository with this code.
2. A Vercel account.
3. A Google Gemini API Key.

### Steps
1. **Push to GitHub**: Push this code to a repository.
2. **Import to Vercel**: 
   - Go to your Vercel Dashboard.
   - Click "Add New..." -> "Project".
   - Import your GitHub repository.
3. **Configure Project**:
   - Framework Preset: **Vite** (should be detected automatically).
   - Build Command: `npm run build`.
   - Output Directory: `dist`.
4. **Environment Variables**:
   - Add a new variable named `API_KEY`.
   - Paste your Google Gemini API key as the value.
5. **Deploy**: Click Deploy.

### GitHub Actions (Optional)
If you want to use the included GitHub Action workflow:
1. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to your GitHub Repository Secrets.
2. Add `API_KEY` to your GitHub Repository Secrets if needed for build time (or ensuring consistency).
