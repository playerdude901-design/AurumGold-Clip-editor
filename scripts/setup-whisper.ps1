$ErrorActionPreference = 'Stop'
$agRuntime = Join-Path $env:LOCALAPPDATA 'AurumGold\whisper-runtime'
py -3 -m venv $agRuntime
if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno. Instala Python 3.11 o 3.12 con el launcher py.' }
$agPython = Join-Path $agRuntime 'Scripts\python.exe'
& $agPython -m pip install --disable-pip-version-check --no-compile 'openai-whisper==20250625'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar Whisper.' }
& $agPython -c "import whisper; whisper.load_model('base'); print('Whisper base listo')"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el modelo base.' }
Write-Output "Whisper instalado en $agRuntime. AurumGold lo detecta automáticamente."
