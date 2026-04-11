import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

const config = vscode.workspace.getConfiguration('bktools');

async function pickExecutable(settingKey: string) {
    const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Выбрать исполняемый файл'
    });

    if (!uri || uri.length === 0) return;

    await config.update(settingKey, uri[0].fsPath, vscode.ConfigurationTarget.Global);
}

function getToolPath(setting: string, name: string): string {
    const toolPath = config.get<string>(setting) || '';
    if (!toolPath) {
        throw new Error(`Не настроен путь к ${name} (${setting})`);
    }
    return toolPath;
}

function getBinDir(emuPath: string): string {
    const dir = path.dirname(emuPath);
    const binDir = path.join(dir, 'Bin');

    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }

    return binDir;
}

function getScriptsDir(emuPath: string): string {
    const dir = path.dirname(emuPath);
    const scriptsDir = path.join(dir, 'Scripts');

    if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
    }

    return scriptsDir;
}

function createBkScript(emuPath: string, programName: string, isFocal: boolean) {
    let content: string;

    if (isFocal) {
        content = `L G ${programName}\r\n`;
    } else {
        content = `LOAD "${programName}"\r\n`;
    }

    const scriptsDir = getScriptsDir(emuPath);
    const scriptPath = path.join(scriptsDir, '_autorun.bkscript');

    console.log(`[BK-Tools] Создание скрипта для эмулятора: ${scriptPath}`);

    fs.writeFileSync(scriptPath, content, { encoding: 'utf8' });
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

    context.subscriptions.push(
        vscode.commands.registerCommand("bktools.pickBasicPreprocessor", () =>
            pickExecutable("basicPreprocessor"),
        ),
        vscode.commands.registerCommand("bktools.pickFocalPreprocessor", () =>
            pickExecutable("focalPreprocessor"),
        ),
        vscode.commands.registerCommand("bktools.pickSendBasic", () =>
            pickExecutable("sendBasic"),
        ),
        vscode.commands.registerCommand("bktools.pickSendFocal", () =>
            pickExecutable("sendFocal"),
        ),
        vscode.commands.registerCommand("bktools.pickEmulator", () =>
            pickExecutable("emulatorExecutable"),
        ),
    );

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

        if (['.bas', '.bvk', '.vil', '.bk', '.asc'].includes(ext)) {
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
    const ppPath = getToolPath('basicPreprocessor', 'BkBasicPreprocessor');

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
        const workDir = path.dirname(filePath);
        await execAsync(ppCommand, workDir);
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
    const ppPath = getToolPath('focalPreprocessor', 'BkFocalPreprocessor');

    const ppCommand = `"${ppPath}" "${filePath}" "${tmpFile}" /packnames=true`;

    console.log(`[BK-Tools] Запуск препроцессора Focal`);
    logCommand('BkFocalPreprocessor', ppCommand);

    try {
        const workDir = path.dirname(filePath);
        await execAsync(ppCommand, workDir);
        console.log(`[BK-Tools] Препроцессор Focal завершён успешно. tmpFile = ${tmpFile}`);
        vscode.window.showInformationMessage(`Focal обработан → ${tmpFile}`);

        await sendFocal(tmpFile, format, name);
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkFocalPreprocessor:`, err.message);
        vscode.window.showErrorMessage(`Ошибка препроцессора Focal: ${err.message}`);
    }
}

async function sendBasic(tmpFile: string, format: string, name: string) {
    const sendPath = getToolPath('sendBasic', 'BkSendBasic');
    const emuPath = config.get<string>('emulatorExecutable') || '';
    const emuDir = path.dirname(emuPath);
    const programName = name;
    const binDir = getBinDir(emuPath);
    const binPath = path.join(binDir, `${programName}.bin`);

    let command = `"${sendPath}" "${tmpFile}" "${binDir}" /format=${format} /name=${name}`;

    if (format === 'WAV') {
        const outFile = path.join(binDir, `${name}.wav`);
        command = `"${sendPath}" "${tmpFile}" "${outFile}" /format=${format} /name=${name}`;
        const silentLen = config.get<number>('defaultSilentLen') || 3;
        command += ` /silentlen=${silentLen}`;
    }

    console.log(`[BK-Tools] Отправка Basic программы`);
    logCommand('BkSendBasic', command);

    try {
        const workDir = path.dirname(tmpFile);
        await execAsync(command, workDir);
        console.log(`[BK-Tools] Отправка Basic завершена успешно (формат: ${format})`);
        vscode.window.showInformationMessage(`Basic отправлен в формате ${format}`);
        if (format === 'BIN') {
            createBkScript(emuPath, programName, false);
            await runEmulatorWithScript(false);
        }
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkSendBasic:`, err.message);
        vscode.window.showErrorMessage(`Ошибка отправки Basic: ${err.message}`);
    }
}

async function sendFocal(tmpFile: string, format: string, name: string) {
    const sendPath = getToolPath('sendFocal', 'BkSendFocal');
    const emuPath = config.get<string>('emulatorExecutable') || '';
    const emuDir = path.dirname(emuPath);
    const programName = name;
    const binDir = getBinDir(emuPath);
    const outFile = path.join(binDir, `${programName}.bin`);

    let command = `"${sendPath}" "${tmpFile}" "${outFile}" /format=${format} /name=${programName}`;

    if (format === 'WAV') {
		command = command.replace('.bin', '.wav');
        const silentLen = config.get<number>('defaultSilentLen') || 3;
        command += ` /silentlen=${silentLen}`;
    }

    console.log(`[BK-Tools] Отправка Focal программы`);
    logCommand('BkSendFocal', command);

    try {
        const workDir = path.dirname(tmpFile);
        await execAsync(command, workDir);
        console.log(`[BK-Tools] Отправка Focal завершена успешно (формат: ${format})`);
        vscode.window.showInformationMessage(`Focal отправлен в формате ${format}`);

        if (format === 'BIN') {
            createBkScript(emuPath, programName, true);
            await runEmulatorWithScript(true);
        }
    } catch (err: any) {
        console.error(`[BK-Tools] Ошибка BkSendFocal:`, err.message);
        vscode.window.showErrorMessage(`Ошибка отправки Focal: ${err.message}`);
    }
}

async function runEmulatorWithScript(isFocal: boolean) {
    const isEmulatorStartEnabled = config.get<boolean>('defaultStartEmulator') || false;
    if (!isEmulatorStartEnabled) {
        console.log(`[BK-Tools] Автоматический запуск эмулятора отключён в настройках.`);
        return;
    }

    const emuExe = config.get<string>('emulatorExecutable');
    if (!emuExe) {
        throw new Error('Не задан путь к BK_x64.exe');
    }

    const profile = isFocal ? 'BK-0010-01_MSTD' : 'BK-0010-01';

    const cmd = `"${emuExe}" /C "${profile}" /S "_autorun.bkscript"`;

    console.log(`[BK-Tools] Старт эмулятора: ${cmd}`);

    await execAsync(cmd, path.dirname(emuExe));
}

function execAsync(command: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        cp.exec(command, { encoding: 'utf8', cwd: cwd }, (error, stdout, stderr) => {
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
