# Publish hi for free

The easiest free full-stack host for this MVP is Render. It supports Node.js web services and assigns an `onrender.com` address, so both the website and its API run together.

## Deploy

1. Create a free GitHub repository and upload this project.
2. Create a free account at [Render](https://render.com).
3. Click **New** → **Blueprint**, connect the GitHub repository, and select `render.yaml`.
4. Confirm the service named `hi-speaking-practice` and choose the **Free** plan.
5. After it builds, Render gives you an address such as `https://hi-speaking-practice.onrender.com`.

The existing `render.yaml` starts `backend/server.js`; this serves the website, login API, language API, and voice-practice page together.

## Domain choice

An arbitrary custom name such as `hi.com` cannot be free because internet domains must be registered. You can use Render's free `onrender.com` subdomain, or deploy on Vercel's free Hobby plan for a `project-name.vercel.app` address. Attach a custom domain later if you buy one.

## Free-tier notes

Render's free web service spins down after 15 minutes without traffic, so the first visit afterward can take around a minute. This MVP stores users in memory, so accounts reset when the service restarts; connect a database before treating it as a public production service.
