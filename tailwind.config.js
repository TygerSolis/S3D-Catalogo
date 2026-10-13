/** Configuración de Tailwind (v3.4) para compilar tailwind.css. Ver README, sección Maintenance. */
module.exports = {
    content: ['./index.html', './catalogo.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Manrope', 'sans-serif'],
                title: ['Space Grotesk', 'sans-serif'],
            },
            colors: {
                brand: {
                    900: '#002244',
                    800: '#003366',
                    accent: '#0066cc',
                    light: '#e6f0fa',
                    50: '#f0f7ff'
                }
            },
            boxShadow: {
                'soft': '0 10px 40px -10px rgba(0,51,102,0.08)',
                'float': '0 20px 40px -10px rgba(0,102,204,0.15)',
            }
        }
    }
};
