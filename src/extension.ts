import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';

const config = vscode.workspace.getConfiguration('bktools');

function getPreprocessorPath(tool: string): string {
    const base = config.get<string>('preprocessorPath') || '';
    if (!base) throw new Error('Не настроен путь к препроцессорам (bktools.preprocessorPath)');
    return path.join(base, tool);
}

function getSendPath(tool: string): string {
    const base = config.get<string>('sendUtilsPath') || '';
    if (!base) throw new Error('Не настроен путь к BkTapePortUtils (bktools.sendUtilsPath)');
    return path.join(base, tool);
}

async function selectFormat(): Promise<string> {
    const options = [
        { label: 'BIN — в эмулятор', value: 'BIN', detail: 'Отправить .bin файл в папку эмулятора' },
        { label: 'WAV — аудио', value: 'WAV', detail: 'Создать WAV-файл с тишиной' },
        { label: 'ASC — текстовый формат', value: 'ASC', detail: 'Текстовый формат' }
    ];

    const pick = await vscode.window.showQuickPick(options, {
        title: 'Выберите формат вывода',
        placeHolder: 'BIN / WAV / ASC'
    });

    return pick ? pick.value : 'BIN';
}

function logCommand(commandName: string, command: string) {
    console.log(`[BK-Tools] ${commandName}`);
    console.log(`   → Команда: ${command}`);
    console.log(`   → Время: ${new Date().toLocaleTimeString()}`);
    console.log('   ----------------------------------------');
}

// Проверяем, есть ли в файле нумерация строк (начинаются ли строки с цифр)
async function hasLineNumbers(document: vscode.TextDocument): Promise<boolean> {
    const text = document.getText();
    const lines = text.split('\n').slice(0, 50); // проверяем первые 50 строк

    let numberedLines = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue; // пропускаем пустые строки

        // Проверяем, начинается ли строка с числа (например: 100, 10, 5000 и т.д.)
        if (/^\s*\d+\s+/.test(trimmed)) {
            numberedLines++;
        }
    }

    // Если больше 40% строк имеют номера — считаем, что нумерация уже есть
    const hasNumbers = numberedLines / Math.max(lines.filter(l => l.trim().length > 0).length || 1) > 0.4;

    console.log(`[BK-Tools] Анализ нумерации строк: ${numberedLines} из ${lines.length} строк начинаются с номера → ${hasNumbers ? 'ЕСТЬ' : 'НЕТ'}`);
    
    return hasNumbers;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('=== BK-0010 Tools активировано ===');
    console.log('Preprocessor path:', config.get<string>('preprocessorPath'));
    console.log('SendUtils path:', config.get<string>('sendUtilsPath'));
    console.log('Emulator path:', config.get<string>('emulatorPath'));

    let disposable = vscode.commands.registerCommand('bktools.buildAndSend', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Нет открытого файла');
            return;
        }

		const document = editor.document;
        const filePath = document.fileName;
        const ext = path.extname(filePath).toLowerCase();
        const format = await selectFormat();

        console.log(`[BK-Tools] Запущена команда buildAndSend для файла: ${filePath}`);

        console.log(`[BK-Tools] Запущена команда buildAndSend`);
        console.log(`   Файл: ${filePath}`);
        console.log(`   Расширение: ${ext}`);
        console.log(`   Выбран формат: ${format}`);

        if (['.bas', '.bvk', '.vil', '.bk'].includes(ext)) {
            await buildAndSendBasic(document, format);
        } else if (['.foc', '.focal', '.bkf'].includes(ext)) {
            await buildAndSendFocal(filePath, format);
        } else {
            vscode.window.showErrorMessage('Неизвестный тип файла. Поддерживаются .bas/.bvk/.vil/.bk для Basic и .foc/.focal/.bkf для Focal.');
        }
    });

    context.subscriptions.push(disposable);
}

async function buildAndSendBasic(document: vscode.TextDocument, format: string) {
    const filePath = document.fileName;
    const tmpFile = filePath.replace(/\.\w+$/, '.tmp');
    const name = path.basename(filePath, path.extname(filePath)).toUpperCase();
    const ppPath = getPreprocessorPath('BkBasicPreprocessor.exe');

    // Определяем, нужна ли авто-нумерация
    const hasNumbers = await hasLineNumbers(document);
    const autonumParam = hasNumbers ? '' : '/autonumlines=true';

    let ppCommand = `"${ppPath}" "${filePath}" "${tmpFile}" /packnames=true /stripspaces=true`;

    if (autonumParam) {
        ppCommand += ` ${autonumParam}`;
    }

    console.log(`[BK-Tools] Авто-нумерация строк: ${hasNumbers ? 'ОТКЛЮЧЕНА' : 'ВКЛЮЧЕНА'}`);
    logCommand('BkBasicPreprocessor', ppCommand);

    try {
        await execAsync(ppCommand);
        console.log(`[BK-Tools] Препроцессор Basic завершён. tmpFile = ${tmpFile}`);
        vscode.window.showInformationMessage(`Basic обработан ${hasNumbers ? '(нумерация уже есть)' : '(добавлена нумерация)'}`);

        await sendBasic(tmpFile, format, name);
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkBasicPreprocessor:`, err.message);
        vscode.window.showErrorMessage(`Ошибка препроцессора: ${err.message}`);
    }
}

async function buildAndSendFocal(filePath: string, format: string) {
    const tmpFile = filePath.replace(/\.\w+$/, '.tmp');
    const name = path.basename(filePath, path.extname(filePath)).toUpperCase();
    const ppPath = getPreprocessorPath('BkFocalPreprocessor.exe');

    const ppCommand = `"${ppPath}" "${filePath}" "${tmpFile}" /packnames=true`;

    console.log(`[BK-Tools] Запуск препроцессора Focal`);
    logCommand('BkFocalPreprocessor', ppCommand);

    try {
        await execAsync(ppCommand);
        console.log(`[BK-Tools] Препроцессор Focal завершён успешно. tmpFile = ${tmpFile}`);
        vscode.window.showInformationMessage(`Focal обработан → ${tmpFile}`);

        await sendFocal(tmpFile, format, name);
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkFocalPreprocessor:`, err.message);
        vscode.window.showErrorMessage(`Ошибка препроцессора Focal: ${err.message}`);
    }
}

async function sendBasic(tmpFile: string, format: string, name: string) {
    const sendPath = getSendPath('BkSendBasic.exe');
    const emuPath = config.get<string>('emulatorPath') || '';
    let command = `"${sendPath}" "${tmpFile}" "${emuPath}" /format=${format} /name=${name}`;

    if (format === 'WAV') {
    	command = `"${sendPath}" "${tmpFile}" "${emuPath}\\${name}.wav" /format=${format} /name=${name}`;
        const silentLen = config.get<number>('defaultSilentLen') || 3;
        command += ` /silentlen=${silentLen}`;
    }

    console.log(`[BK-Tools] Отправка Basic программы`);
    logCommand('BkSendBasic', command);

    try {
        await execAsync(command);
        console.log(`[BK-Tools] Отправка Basic завершена успешно (формат: ${format})`);
        vscode.window.showInformationMessage(`Basic отправлен в формате ${format}`);
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkSendBasic:`, err.message);
        vscode.window.showErrorMessage(`Ошибка отправки Basic: ${err.message}`);
    }
}

async function sendFocal(tmpFile: string, format: string, name: string) {
    const sendPath = getSendPath('BkSendFocal.exe');
    const emuPath = config.get<string>('emulatorPath') || '';
    let command = `"${sendPath}" "${tmpFile}" "${emuPath}\\${name}.bin" /format=${format} /name=${name}`;

    if (format === 'WAV') {
		command = command.replace('.bin', '.wav');
        const silentLen = config.get<number>('defaultSilentLen') || 3;
        command += ` /silentlen=${silentLen}`;
    }

    console.log(`[BK-Tools] Отправка Focal программы`);
    logCommand('BkSendFocal', command);

    try {
        await execAsync(command);
        console.log(`[BK-Tools] Отправка Focal завершена успешно (формат: ${format})`);
        vscode.window.showInformationMessage(`Focal отправлен в формате ${format}`);
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkSendFocal:`, err.message);
        vscode.window.showErrorMessage(`Ошибка отправки Focal: ${err.message}`);
    }
}

function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || stdout || error.message));
            } else {
                resolve(stdout);
            }
        });
    });
}

export function deactivate() {
    console.log('=== BK-0010 Tools деактивировано ===');
}
