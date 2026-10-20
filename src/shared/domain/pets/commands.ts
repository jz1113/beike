const petCommand = /^npx\s+codex-pets\s+add\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/;
const shellNoise = /[|&;`$<>(){}\\]|\s(?:&&|\|\|)\s/;

export interface ParsedPetCommand {
  input: string;
  id?: string;
  error?: string;
}

export function parsePetCommands(text: string): ParsedPetCommand[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((input) => {
    if (shellNoise.test(input)) return { input, error: '只接受 npx codex-pets add 宠物标识' };
    const match = petCommand.exec(input);
    if (!match) return { input, error: '只接受 npx codex-pets add 宠物标识' };
    return { input, id: match[1] };
  });
}
