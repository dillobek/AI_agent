import { toGeminiFunctionDeclaration } from './gemini-tool-mapper.util';
import { ToolDeclaration } from './ai-provider.adapter';

describe('toGeminiFunctionDeclaration', () => {
  it('coerces every parameter type to STRING and carries description/enum through', () => {
    const tool: ToolDeclaration = {
      name: 'search_youtube',
      description: 'Searches YouTube for a video.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'string', description: 'What to search for' },
          maxResults: { type: 'number', description: 'How many results', enum: ['1', '5', '10'] },
        },
        required: ['query'],
      },
    };

    const result = toGeminiFunctionDeclaration(tool);

    expect(result.name).toBe('search_youtube');
    expect(result.description).toBe('Searches YouTube for a video.');
    expect(result.parameters.required).toEqual(['query']);
    expect(result.parameters.properties.query.description).toBe('What to search for');
    expect(result.parameters.properties.maxResults.enum).toEqual(['1', '5', '10']);
    // Every property, including the numeric-typed one, is coerced to the same Gemini STRING type.
    expect(result.parameters.properties.query.type).toBe(result.parameters.properties.maxResults.type);
  });

  it('defaults required to an empty array when the tool declares none', () => {
    const tool: ToolDeclaration = {
      name: 'get_today_plan',
      description: "Gets today's plan.",
      parameters: { type: 'OBJECT', properties: {} },
    };

    const result = toGeminiFunctionDeclaration(tool);
    expect(result.parameters.required).toEqual([]);
    expect(result.parameters.properties).toEqual({});
  });
});
