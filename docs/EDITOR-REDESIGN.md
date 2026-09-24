# AurumGold: espacio de edición

## Ejecutar

Desde la carpeta `AurumGold-Clip-editor`, ejecuta `npm install` y `npm start`.
Los cambios están implementados sobre la copia local, conservando las modificaciones que ya existían.

El espacio se divide en Source, Program vertical, inspector de 320 px y timeline. La altura inicial de la timeline es 280 px; arrastra su borde superior o enfoca el separador y usa las flechas. Se guarda en `ag-timeline-h`.

## Edición

- V selecciona; C corta por fotograma; H desplaza la vista; S alterna snap.
- Shift+clic y arrastre en espacio vacío seleccionan varios clips. Delete los elimina.
- Arrastra los extremos para recortar y el cuerpo para mover. Las pistas bloqueadas no admiten cambios.
- Doble clic en el label expande una pista de video a 120 px o audio a 100 px.
- Alt+rueda hace zoom bajo el cursor; Ctrl+rueda desplaza horizontalmente. Fit muestra el proyecto.
- J/K/L reproducen hacia atrás, pausan y reproducen hacia adelante. Flechas avanzan por fotograma.
- I/O marcan el rango de exportación. Los botones In/Out de Source definen el fragmento para Insert y Overwrite.
- Insert desplaza los clips de V1/A1; Overwrite sustituye el rango de esas pistas. El material de origen sigue siendo el video horizontal cargado.
- Los clips situados en pistas de video superiores cubren los inferiores. Los huecos salen negros. Audio respeta mute, solo, volumen, desplazamiento, recorte y velocidad.
- Ctrl+Z y Ctrl+Shift+Z/Ctrl+Y deshacen y rehacen. Las pistas, cámaras y subtítulos se recuperan al reabrir.

El menú de velocidad/duración acepta velocidades entre 0.25 y 4. La reproducción inversa sirve para revisión, no cambia la velocidad de exportación.

## Subtítulos

Transcribir muestra progreso de actividad, ejecuta FFmpeg a WAV mono de 16 kHz y prueba nodejs-whisper. Si el binario o el modelo no están disponibles, utiliza Python con openai-whisper. No devuelve texto de demostración ante un fallo.

En Windows puedes preparar el motor local mediante:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-whisper.ps1
```

Este script crea un entorno aislado en `%LOCALAPPDATA%\AurumGold\whisper-runtime`, instala Whisper y descarga el modelo `base`. Requiere Python y conexión durante la instalación. Después, el audio se procesa localmente. Para usar otro intérprete define `AG_WHISPER_PYTHON` antes de abrir AurumGold. `AG_WHISPER_MODELS` permite indicar la carpeta del modelo `ggml-base.bin` de nodejs-whisper; también requiere su binario `whisper-cli` compilado.

La transcripción devuelve palabras con tiempos y las coloca según los recortes y velocidades de la secuencia. Se agrupan en unos cuatro términos por bloque. El panel se abre también con resultado vacío o error. Puedes editar texto y tiempos, añadir bloques, saltar al tiempo de un bloque al enfocarlo y pulsar Aplicar. El estilo se modifica desde la pestaña Subtítulos.

El modelo y Python son recursos locales opcionales, no están incluidos en el ZIP del código ni en el instalador de Electron. Un equipo nuevo debe ejecutar la preparación o configurar un motor existente. La app muestra la causa si no encuentra ninguno.

## Exportación

La pestaña Exportar ofrece resolución, nombre, carpeta, FPS y formato MP4/MOV/MKV. Mantiene la composición multicámara y la codificación H.264/AAC. La secuencia pasa al filtro FFmpeg, incluyendo cortes, huecos, pistas ocultas, velocidades y mezcla de audio. Los subtítulos ASS se ajustan al rango In/Out antes de quemarse. La preparación de subtítulos se realiza desde su pestaña; exportar no inicia una transcripción inesperada.

## Módulos

| Archivo | Responsabilidad |
| --- | --- |
| `renderer/aurumgold-layout.css` | Todo el estilo nuevo del espacio |
| `renderer/components/layout.js` | Menús, pestañas y reubicación de controles |
| `renderer/components/monitors.js` | Transporte y códigos de tiempo |
| `renderer/components/timeline-panel.js` | Separador y altura persistente |
| `renderer/components/timeline-tracks.js` | Modelo de clips, cortes y edición |
| `renderer/components/timeline-engine.js` | Regla en canvas, gestos y zoom |
| `renderer/components/timeline-playhead.js` | Reloj, reproducción y mezcla de previsualización |
| `renderer/components/waveform-cache.js` | Carga compartida de waveforms |
| `renderer/components/subtitle-engine.js` | Solicitud de transcripción y adaptación a secuencia |
| `renderer/components/subtitle-editor.js` | Editor lateral y controles de estilo |
| `renderer/components/history.js` | Historial de edición |
| `main/sequence-filters.js` | Planificación de filtros de la secuencia |
| `main/subtitle-engine.js` | Extracción, interpretación de tiempos y ASS |
| `main/transcribe-worker.js` | Motores Whisper fuera del proceso principal |

## Verificación

`npm test` crea un video sintético y comprueba el modelo de edición, los timestamps y una exportación FFmpeg real. `npm run test:ui` abre Electron fuera de pantalla, en un perfil temporal, y prueba carga, separador, cortes, undo/redo, editor vacío, error visible y recuperación de sesión. Los resultados visuales y videos de prueba se guardan en `test-output`, excluido de Git.

La calidad del reconocimiento depende del idioma, del audio y del modelo. La previsualización usa reproducción de medios de Chromium; la exportación aplica los filtros de FFmpeg. Los servicios de descarga Twitch/Kick se conservan, pero no se prueban contra servicios externos en esta batería.
