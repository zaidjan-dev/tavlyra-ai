TAVLYRA AI — NETLIFY VERSION

Is ZIP mein website aur Netlify Function dono shamil hain.

IMPORTANT:
- GitHub repository mein ZIP file ko akela upload karne se site deploy nahi hogi. ZIP extract karke andar ke tamam files/folders repository ke root mein upload karne hain.
- Folder structure bilkul aisa rehna chahiye:
  netlify.toml
  public/index.html
  public/_headers
  netlify/functions/chat.js

NETLIFY DEPLOY:
1. https://app.netlify.com/signup par account banao ya login karo.
2. Add new project / Import an existing project chuno.
3. GitHub connect karke Tavlyra repository select karo.
4. Build settings mein Build command blank/no command rakho. Publish directory `public` aur Functions directory `netlify/functions` honi chahiye. netlify.toml ye settings khud set karta hai.
5. Deploy karo.
6. Site dashboard > Site configuration (ya Project configuration) > Environment variables mein jao.
7. Add variable: GEMINI_API_KEY = tumhari Google AI Studio API key. Isay kabhi public chat ya GitHub code mein mat likhna.
8. Save karo aur latest deploy ko redeploy karo.

API KEY:
Google AI Studio: https://aistudio.google.com/app/apikey

TEST:
Live site par Roman Urdu mein poochho: Salam Tavlyra, tum kaun ho?

NOTE:
Ye starter prototype hai, full production SaaS nahi. Ismein abhi user accounts, database/chat history sync, rate limits, payments aur abuse protection nahi hain. Public launch se pehle ye cheezen add karni hongi. Gemini API ki usage par charges/limits Google ke account aur plan ke mutabiq ho sakte hain.
