// Arquivo de verificação do Google Search Console (propriedade https://interno.grupor1.com/), usado pelo app
// "Grupo R1" de login com Google. Servido em /google7ed07b9103c95d08.html (rewrite no vercel.json).
// Não apagar: se sumir, o Google pode cancelar a verificação.
export const GET = () => new Response('google-site-verification: google7ed07b9103c95d08.html', {
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
});
