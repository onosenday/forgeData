# FoE Data Exporter

Extensión de Chrome para exportar datos del juego Forge of Empires a JSON y Excel.

## Funcionalidades

### 📄 Exportar JSON
Exporta todos los datos del juego:
- `MainParser` con `CityMapData` (edificios de tu ciudad)
- `buildingData` (catálogo completo de edificios)

### 📊 Excel Eficiencia
Genera un Excel con tus edificios organizados por **eficiencia de boosts** (boosts/tamaño):
- **Bono Completo**: Todos los boosts
- **Bono CdB**: Campo de Batalla
- **Bono Expe**: Expedición de Gremio
- **Bono IC**: Incursiones de Campo

### 📚 Excel Catálogo
Genera un Excel con el **catálogo completo** de edificios del juego, organizado por era.

## Requisitos

- Chrome, Brave, Edge o similar
- **FoE Helper** instalado y activo

## Instalación

1. Abre `chrome://extensions/`
2. Activa **Modo desarrollador**
3. Clic en **Cargar descomprimida**
4. Selecciona la carpeta `foe_data`

## Uso

1. Abre Forge of Empires y entra en tu ciudad
2. Clic en el icono de la extensión
3. Elige qué exportar:
   - **Exportar JSON**: Datos crudos
   - **Excel Eficiencia**: Análisis de tus edificios
   - **Excel Catálogo**: Todos los edificios del juego

## Estructura del proyecto

```
foe_data/
├── images/           # Iconos de la extensión
├── lib/
│   └── xlsx.mini.min.js  # SheetJS para Excel
├── src/
│   └── popup.js      # Lógica principal
├── manifest.json
├── popup.html
└── README.md
```

## Licencia

MIT - Libre para uso y distribución.