// Fuentes self-host (@fontsource) — reemplazan Google Fonts para NO bloquear el
// render (el @import a fonts.googleapis dentro de un CSS era el peor caso para LCP).
// Solo los pesos que usa el diseño; cada peso trae unicode-range, así el navegador
// baja solo el subset latino que usamos. font-display:swap (default de @fontsource).
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/hanken-grotesk/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
