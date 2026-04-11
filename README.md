# BK Preprocessor Tools Extension

Инструменты для БК-0010: препроцессоры (Basic + Focal) + отправка в эмулятор / WAV для БК.

## Возможности

- Одна команда **Build & Send** (`Ctrl+Alt+R`) или (`Ctrl+Shift+P`): `BK: Build & Send (Автоопределение языка)`
- Автоопределение языка (`.bas`/`.bvk`/`.vil`/`.bk` → Basic, `.foc`/`.focal`/`.bkf` → Focal)
- Поддержка `BkBasicPreprocessor` и `BkFocalPreprocessor`
- Поддержка `BkSendBasic` / `BkSendFocal` (BIN / WAV / ASC)
- Настраиваемые пути через Settings
- Запуск эмулятора с автозагрузкой

## Установка

1. Установите расширение bk-ext-tools **BK Preprocessor Tools** из [Marketplace](https://marketplace.visualstudio.com/items?itemName=kalininskiy.bk-ext-tools).
2. Установите два расширения для подсветки (рекомендуется):
   - [Vilnius BASIC 86](https://marketplace.visualstudio.com/items?itemName=kalininskiy.bkbasic)
   - [BK FOCAL](https://marketplace.visualstudio.com/items?itemName=kalininskiy.bkfocal)

## Настройка (обязательно)

Откройте **Settings** (`Ctrl+,`) → введите `bktools`:

- Укажите пути к исполняемым файлам препроцессоров и к утилит отправки файлов БК. 
- Проект препроцессоров БК - [ссылка](https://github.com/tereshenkovav/BkPreprocessors).
- Проект утилит отправки файлов БК - [ссылка](https://github.com/tereshenkovav/BkTapePortUtils).
- Так же укажите надо ли запускать эмулятор и установите тишину в секундах при создании WAV (по умолчанию 3)

## Использование

- `Ctrl+Alt+R` — **Build & Send** (авто)
- Команды в Command Palette (`Ctrl+Shift+P`):
  - `BK: Build & Send (Автоопределение языка)`

### Примеры вывода

- Basic → `.tmp` → `.bin` / `.wav`
- Focal → `.tmp` → `.bin` / `.wav`

## 📞 Контакты

(с) 2026 by Ivan "VDM" Kalininskiy
- Telegram: [@VanDamM](https://t.me/VanDamM)
- GitHub: [kalininskiy](https://github.com/kalininskiy)
