# Forge of Empires Data & Efficiency Analyzer

Esta extensión para Google Chrome es una herramienta de ayuda **pasiva** que te permite analizar la eficiencia de los edificios de tu ciudad en Forge of Empires y explorar el catálogo completo del juego.

El objetivo es ayudarte a tomar decisiones estratégicas basadas en datos reales de eficiencia militar y de espacio.

![Captura de pantalla](store_screenshot.png)

## ⚠️ Transparencia y Privacidad

Esta herramienta ha sido diseñada respetando las normas de juego limpio:

*   **NO es un bot:** No realiza ninguna acción automática en el juego. Tu cuenta nunca realizará acciones sin tu interacción directa.
*   **NO recoge datos personales:** Todos los datos del juego se procesan **localmente**. 
*   **Estadísticas de Uso Anónimas:** La extensión cuenta las veces que se usan los botones de exportación (ej: "Exportar Eficiencia") para saber qué funciones son útiles.
    *   Esta función es **totalmente anónima** (usa un ID aleatorio, no tu usuario).
    *   Puedes **desactivarla** en cualquier momento desde la Configuración.
*   **NO altera el juego:** Funciona únicamente leyendo los datos que el juego envía a tu navegador.

## Funcionalidades

### 1. 📊 Análisis de Eficiencia de Ciudad (Excel)
Genera un informe detallado en Excel de **tu ciudad actual**, calculando la eficiencia real de cada edificio.

*   **Fórmula de Eficiencia:** Calcula el boost militar ofrecido por cada casilla ocupada, teniendo en cuenta el tamaño del edificio y si requiere carretera.
*   **Hojas separadas:** Organiza los datos para diferentes modos de juego:
    *   **Bono Completo:** Eficiencia global.
    *   **Bono CdB:** Específico para Campos de Batalla.
    *   **Bono Expe:** Específico para Expedición de Gremio.
    *   **Bono IC:** Específico para Incursiones Cuánticas.

### 2. 📚 Catálogo Completo del Juego (Excel)
Descarga una base de datos con **todos los edificios que existen en el juego**, organizados por Era.

*   Ideal para planificar futuras ciudades o comparar edificios que aún no tienes.
*   Incluye estadísticas de ataque/defensa para diferentes modos.

## Instalación

1. Descarga el código o el archivo ZIP de la última versión.
2. Abre `chrome://extensions/` en tu navegador.
3. Activa el **Modo para desarrolladores** (arriba a la derecha).
4. Haz clic en **Cargar descomprimida** y selecciona la carpeta de la extensión.

## Uso

1. Entra en tu ciudad en Forge of Empires.
2. Haz clic en el icono de la extensión (brújula dorada) en la barra del navegador.
3. Selecciona la opción deseada:
    *   **Excel Eficiencia:** Para analizar lo que tienes construido ahora mismo.
    *   **Excel Catálogo:** Para ver la lista de todos los edificios del juego.

La extensión procesará los datos y descargará automáticamente el archivo `.xlsx` correspondiente.

## Configuración 

En el menú de ajustes de la extensión puedes configurar:
*   **Ubicación de descarga:** Guardar en la carpeta por defecto, en una subcarpeta específica ("FoE_Data") o preguntar siempre dónde guardar cada archivo.

---
**Nota:** Esta extensión no está afiliada ni respaldada por InnoGames. Es una herramienta creada por fans para fans.