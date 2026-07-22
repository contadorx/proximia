/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // As fontes são carregadas pelo navegador, não embutidas na compilação.
  // Assim o build não depende de alcançar o servidor de fontes — se ele
  // estiver fora, o app compila igual e cai na fonte do sistema.
  optimizeFonts: false,
};

export default nextConfig;
