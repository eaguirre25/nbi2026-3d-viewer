# Publicar el visor en una URL permanente

Este paquete es un sitio estático completo. No necesita backend.

## Opción recomendada: GitHub Pages

1. Crear un repositorio en GitHub, por ejemplo `nbi2026-3d-viewer`.
2. Subir todo el contenido de esta carpeta a la raíz del repositorio.
3. En GitHub, entrar a `Settings` -> `Pages`.
4. En `Build and deployment`, elegir:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Guardar.

La URL quedará con esta forma:

```text
https://TU_USUARIO.github.io/nbi2026-3d-viewer/
```

El visor de isócronas quedará en:

```text
https://TU_USUARIO.github.io/nbi2026-3d-viewer/isocronas_escolares/
```

## Opción alternativa: Netlify

1. Entrar a Netlify.
2. Crear un sitio nuevo.
3. Subir esta carpeta completa o conectar el repositorio.
4. Publicar con carpeta raíz como directorio público.

El archivo `netlify.toml` ya deja configurado el sitio como publicación estática.

## Importante

Las URLs locales como `http://127.0.0.1:8765/` funcionan sólo en esta computadora.
Para una URL permanente hace falta subir este paquete a un servicio externo.
