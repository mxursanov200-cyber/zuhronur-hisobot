# Netlify’ga joylash

## GitHub orqali

1. Loyihani GitHub repository’ga yuklang.
2. Netlify’da **Add new site → Import an existing project** ni tanlang.
3. GitHub repository’ni tanlang. Netlify `netlify.toml` sozlamalarini avtomatik oladi.
4. **Deploy** tugmasini bosing.
5. Netlify bergan `https://...netlify.app` manzilni Supabase Dashboard → Authentication → URL Configuration ichidagi **Site URL** va **Redirect URLs** ga kiriting.

## Tayyor ZIP orqali

`zuhronur-netlify.zip` faylini ochib, ichidagi loyiha papkasini GitHub orqali Netlify’ga ulang. Bu dastur server funksiyalaridan foydalangani uchun oddiy drag-and-drop usuli yetarli emas.

## Muhim

- Frontendda faqat Supabase publishable key ishlatiladi; maxfiy service-role kalit mavjud emas.
- Xodim faqat o‘z profilini va o‘z yozuvlarini ko‘radi.
- Boshqaruvchi barcha uch bo‘limni ko‘radi; Tashqi reklama xodimlari profilini alohida ochadi.
- Bo‘limlar va yozuvlar Supabase Row Level Security orqali ajratilgan.
