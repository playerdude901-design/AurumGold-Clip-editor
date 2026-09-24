# Personalización de subtítulos

La edición visual se guarda en `cue.style`. Cada bloque recibe una copia completa del estilo al crearse o al migrar una sesión antigua. Los valores globales son únicamente los valores iniciales de los bloques futuros.

## Uso

1. Abre Subtítulos y el editor de bloques.
2. Clic selecciona un bloque; Shift + clic añade bloques a la selección. Ctrl + A selecciona todos mientras el editor está abierto. Clic en el espacio vacío de la lista limpia la selección.
3. El encabezado indica qué se está editando. Con varios bloques se muestran los valores del primero seleccionado. Cada control modifica únicamente su propiedad en los bloques seleccionados; conserva las demás diferencias.
4. Sin selección, los controles modifican el estilo por defecto. Los bloques que ya existen conservan su estilo.
5. Aplicar comprueba las fuentes, mide el texto con Canvas, genera ASS y confirma los cambios. Cerrar descarta el borrador. El editor queda abierto y muestra el error si no se puede aplicar.

Las cinco secciones son plegables. TEXTO se abre inicialmente. El canvas negro usa coordenadas 1080 × 1920 y se muestra a 120 px de ancho. Repetir reinicia la entrada, el karaoke y la salida del primer bloque seleccionado. Sin selección muestra un texto de ejemplo con el estilo por defecto.

## Propiedades

- Texto: siete fuentes, tamaño 40–140, colores con hex editable, negrita, cursiva, mayúsculas, borde y sombra con offsets independientes.
- Entrada: once alternativas, duración 100–600 ms. La selección de una entrada establece su duración inicial de referencia. Salida opcional con cinco alternativas y duración independiente.
- Palabras: ocho modos; usa los timestamps originales y conserva los silencios entre palabras. Editar el texto redistribuye sus palabras dentro del intervalo del bloque.
- Posición: presets verticales/horizontales, márgenes negativos o positivos, nueve anclajes y ancho máximo 40–100 %. Los saltos explícitos y las palabras largas se respetan.
- Caja: por palabra, por línea o por bloque, opacidad 0–100 %, radio 0–20 y padding 0–30.

El margen positivo desplaza hacia dentro desde Bottom/Right y hacia abajo/derecha desde Center/Top/Left. El anclaje es independiente del preset de posición. La mayúscula transforma únicamente el texto renderizado y exportado.

Los cuatro presets iniciales y los presets del usuario utilizan `localStorage`, clave `ag-subtitle-style-presets-v1`. Guardar con el mismo nombre sustituye ese preset. Cargar aplica el estilo completo a la selección actual o a los valores por defecto. Eliminar afecta al preset, no a los bloques.

## ASS y coherencia visual

`main/subtitle-ass.js` produce PlayResX 1080 / PlayResY 1920 incluso cuando la resolución de salida es 720p. El exportador existente sigue escalando mediante libass.

Cada evento contiene sus propiedades inline: fuente, tamaño, color, borde, sombra, posición y transformaciones. Un bloque puede necesitar varios eventos y capas: cajas vectoriales detrás, sombra aislada y palabras delante. Esta separación permite radio de caja, blur de sombra sin desenfocar el texto, animación de salida combinada con entrada y estilos distintos por palabra.

Las entradas y salidas se dividen en intervalos de keyframes con `\move`, `\t` y `\fad`. No se combinan `\pos` y `\move` en un mismo evento. Las transiciones simultáneas que multiplican escalas u opacidades se subdividen cada 20 ms para aproximar la curva compuesta. El formato ASS cuantiza los tiempos a centisegundos.

Las palabras llevan `\k` con duración en centisegundos. Los intervalos explícitos restauran el color inactivo al finalizar cada palabra; esto evita el comportamiento acumulativo de un karaoke ASS convencional. Typewriter, Fade per word y Pop per word revelan las palabras en su timestamp, sin volver a distribuir palabras al recortar el rango de exportación.

Canvas mide las fuentes instaladas y proporciona la geometría al generador. Se compensa la diferencia entre el em de CSS y el alto tipográfico de ASS. Puede haber pequeñas diferencias de rasterizado y suavizado entre Chromium y libass. Las cajas se dibujan como curvas Bézier en ASS, sin etiquetas de radio inexistentes.

Referencia del formato: [ASS Override Tags, Aegisub](https://aegisub.org/docs/latest/ass_tags/).

## Fuentes

La app comprueba los nombres de familia del sistema en el proceso principal. No sustituye silenciosamente una fuente ausente. En el equipo de validación están Arial, Impact, Montserrat, Bebas Neue, Oswald y Roboto; Anton falta y se identifica en el selector. Instala Anton en Windows y vuelve a abrir la app para actualizar el indicador.

La llamada normal por IPC siempre verifica las fuentes y mide con Canvas. La API síncrona `generateAssFile` se conserva para scripts existentes; fuera de Electron, si no se suministra `_layout`, utiliza una estimación de ancho. Para obtener la misma geometría que el preview, utiliza el flujo IPC de la app.

## Integración y alcance

`subtitle-style-store.js` conserva el campo style al pasar por las funciones existentes de sincronización. Las operaciones de duplicar/dividir y la serialización ya copian campos adicionales, por lo que los estilos sobreviven a guardar, restaurar y deshacer.

Los archivos del sistema multicámara, las herramientas de timeline, el servicio FFmpeg y el panel de exportación no se modificaron durante esta ampliación. En `preview-canvas.js` únicamente se reemplazó el método de dibujado de subtítulos por el renderer compartido. La transcripción y sus motores se mantienen.

## Verificación

```powershell
npm test
$env:ELECTRON_RUN_AS_NODE=$null
& .\node_modules\.bin\electron.cmd tests/ui-smoke.cjs
& .\node_modules\.bin\electron.cmd tests/subtitle-styles-ui.cjs
& .\node_modules\.bin\electron.cmd tests/transcription-smoke.cjs
```

Las pruebas verifican selección, edición conjunta, aislamiento de defaults, presets, migración, valores cero/negativos, timestamps, anclajes, envoltura, generación de todos los modos, guardado/restauración, duplicación, división y deshacer/rehacer. La prueba visual genera un video real con libass y capturas comparables de Canvas y ASS. La prueba de transcripción usa el motor instalado y un clip de voz de `test-output/speech.mp4`.

`test-output/subtitle-styles-panel.png` muestra el panel. `test-output/subtitle-styles-gallery.mp4` muestra los ocho modos de palabra con distintas entradas y cajas. `test-output/subtitle-native-preview.png` y `test-output/subtitle-ass-preview.png` permiten comparar los dos renderers.
