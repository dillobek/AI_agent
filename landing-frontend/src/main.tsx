import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const features = [
  ['Telegram javoblari', 'Yozishma kontekstini saqlab, sizning uslubingizda xabarlarga javob beradi.'],
  ['Kanal kontenti', 'Mavzu va kontent qoidalaringizdan rasmli post yaratadi hamda kanalga yuboradi.'],
  ['Bitta boshqaruv', 'Control Bot va xavfsiz dashboard orqali jarayonlarni boshqarasiz.'],
];

function App() {
  return <>
    <header className="header"><a className="brand" href="#top">Ai<span>Pixel</span></a><nav><a href="#advantages">Afzalliklar</a><a href="#how">Qanday ishlaydi</a><a href="#start">Boshlash</a></nav><a className="login" href="https://ser.aipixel.uz">Kirish</a></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><h1>Sizning shaxsiy<br/><em>AI jamoangiz</em></h1><p>AiPixel yozishmalar, kanal postlari va kundalik jarayonlarni bitta aqlli tizimda birlashtiradi.</p><div className="hero-actions"><a className="primary" href="#start">Boshlash</a><a className="text-link" href="#how">Qanday ishlaydi <span>→</span></a></div></div><div className="orbital" aria-label="AiPixel assistant visual"><div className="ring r1"/><div className="ring r2"/><div className="core">AI</div><i className="dot d1"/><i className="dot d2"/><i className="dot d3"/></div></section>
      <section id="advantages" className="features"><p className="section-lead">Vaqtingizni siz uchun ishlaydigan tizimga topshiring.</p><div className="feature-list">{features.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h2>{title}</h2><p>{copy}</p></article>)}</div></section>
      <section id="how" className="how"><div><p className="number">01 — 03</p><h2>Oddiy sozlash.<br/>Katta natija.</h2></div><ol><li><b>Ulang</b><p>Telegram va kerakli boshqaruv kanallarini xavfsiz ulang.</p></li><li><b>Qoidani bering</b><p>Uslubingiz yoki kanal kontent siyosatini Markdown faylida yuklang.</p></li><li><b>Nazorat qiling</b><p>AiPixel ishni bajaradi, siz Control Bot yoki dashboard orqali holatni ko‘rasiz.</p></li></ol></section>
      <section id="start" className="cta"><h2>Vaqtingiz muhim.<br/><em>Uni qaytarib oling.</em></h2><p>AiPixel ekotizimini o‘zingizning ish uslubingizga moslang.</p><a className="primary" href="https://ser.aipixel.uz">Dashboard’ga kirish</a></section>
    </main>
    <footer><a className="brand" href="#top">Ai<span>Pixel</span></a><span>© {new Date().getFullYear()} AiPixel</span><a href="mailto:hello@aipixel.uz">hello@aipixel.uz</a></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
