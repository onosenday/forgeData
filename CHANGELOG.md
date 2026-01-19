# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.2.5] - 2026-01-19

### Fixed
- **Catálogo Excel mejorado**: Reordenación de columnas para mejor legibilidad
- **Iconos Global+ corregidos**: Los iconos de eficiencia Global+ ahora se muestran correctamente en las cabeceras
- **Cálculos de boost corregidos**: Correcciones en columnas, orden y cálculos de boost en el catálogo

### Added
- **Era activa automática**: El catálogo Excel ahora se abre con la hoja de la era actual del jugador activa

---

## [1.2.4] - 2026-01-15

### Fixed
- **ZIP incompleto corregido**: El paquete ZIP ahora incluye correctamente `lib/exceljs.min.js` y `lib/xlsx.mini.min.js`, solucionando los errores "Error catálogo" y "Error excel"
- **Traducciones completas**: Todos los mensajes de error y estados de carga ahora están traducidos en los 5 idiomas

### Added
- Nueva clave de traducción `loading.processing` para el spinner de carga
- Nueva clave de traducción `errors.exportJsonError` para errores de exportación JSON
- Workflows de Antigravity para automatizar tareas comunes (`/release`, `/translate`, `/add-boost`, `/debug`)
- Archivo de reglas del proyecto (`.agent/rules.md`)

### Changed
- Mensajes de error hardcodeados en `popup.js` ahora usan el sistema i18n
- El texto "Processing..." en `popup.html` ahora es traducible dinámicamente

---

## [1.2.3] - 2026-01-01

### Added
- **Soporte Multilenguaje**: 5 idiomas soportados (EN, ES, FR, DE, IT)
- **Auto-detección de idioma**: Detecta automáticamente el idioma del navegador
- **Selector de idioma**: Permite cambiar el idioma desde Configuración
- **Versión visible**: Muestra la versión actual en el panel de Configuración
- **Iconos visuales en Excel**: Las cabeceras incluyen iconos para FP, Bienes y modos de eficiencia
- Iconos específicos por modo (Global, CdB, Expe, IC) para mejor legibilidad

### Changed
- Interfaz completamente traducible mediante sistema i18n
- Mejoras de rendimiento en la generación de Excel

---

## [1.2.2] - 2025-12-27

### Added
- Sistema de analytics anónimo (opcional, desactivable)
- Configuración de ubicación de descarga (predeterminado, subcarpeta, preguntar)

### Fixed
- Correcciones en la extracción de boosts combinados
- Mejoras en `expandSpecialBoosts()` para manejar más tipos de boost

---

## [1.2.1] - 2025-12-26

### Added
- Iconos base64 para cabeceras de Excel (`lib/icons_base64.js`)
- Función `generateExcelWithIcons()` para insertar iconos en headers

### Changed
- Migración de SheetJS a ExcelJS para mejor soporte de imágenes
- Tooltips en celdas de iconos mostrando nombre de columna

---

## [1.2.0] - 2025-12-23

### Added
- **Excel Catálogo**: Nueva funcionalidad para exportar todos los edificios del juego por era
- Hojas separadas por era en el catálogo
- Cálculo de eficiencias específicas (CdB, Expe, IC)
- Eficiencias combinadas (Global + modo específico)

### Changed
- Refactorización de `extractBoosts()` para soportar múltiples fuentes de datos
- Mejora en la detección de la era del ayuntamiento

---

## [1.1.0] - 2025-12-20

### Added
- **Excel Eficiencia**: Análisis de la ciudad actual del jugador
- Hojas separadas: Bono Completo, Bono CdB, Bono Expe, Bono IC, Excluídos
- Fórmula de eficiencia: boost / (tamaño + calle)
- Agrupación de edificios duplicados

### Changed
- Mejora en el interceptor para capturar CityMapData

---

## [1.0.0] - 2025-12-15

### Added
- Primera versión pública
- Interceptor de datos del juego (`interceptor.js`)
- Exportación JSON de MainParser
- Interfaz popup básica
- Iconos de extensión (16, 48, 128px)

---

## Tipos de cambios

- **Added**: Nuevas funcionalidades
- **Changed**: Cambios en funcionalidades existentes
- **Deprecated**: Funcionalidades que serán eliminadas próximamente
- **Removed**: Funcionalidades eliminadas
- **Fixed**: Corrección de errores
- **Security**: Correcciones de vulnerabilidades
