import OpenAI from 'openai';
import { db } from './db.server';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set in environment variables');
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Predefined prompts for different sections
const SECTION_PROMPTS = {
  overview: "Provide a concise and comprehensive overview of the country, detailing its geographical location, historical context, political developments, economic structure, and social diversity. Highlight key historical transformations, including governance changes and major conflicts, and explain their impact on the country’s current political and social landscape. Discuss the country's economic foundations, significant industries, and challenges in development. Include an analysis of the population's diversity, mentioning ethnic, religious, or cultural groups, and how these contribute to both the country's cultural heritage and potential sources of tension. Ensure the tone is neutral, factual, and suitable for an informative briefing.",
  demographics: "Provide a detailed overview of the demographic structure of the country, focusing on how historical events, conflict, or political and economic changes have shaped its population. Discuss major trends, such as internal displacement, emigration, aging populations, or shifts in ethnic and religious diversity. Highlight the impact of these demographic changes on social cohesion, economic sustainability, and political dynamics. Include any government or societal efforts to address demographic challenges, such as initiatives to encourage population return, promote inclusivity, or support marginalized groups. Conclude with an analysis of the opportunities and challenges presented by the country's current demographic structure. Ensure the tone is neutral, factual, and suitable for an informative briefing as a US CIA intelligence analyst.",
  politics: "Provide a detailed overview of the political landscape of the country, focusing on its major political parties, factions, and alliances. Discuss how these groups shape the country's governance and policies, noting their historical development, key leadership figures, and ideological orientations. Highlight the role of significant parliamentary alliances or coalitions and their impact on domestic and regional politics. Include examples of smaller but influential parties or movements that contribute to the diversity of the political spectrum. Conclude with a brief analysis of the country's current political challenges and dynamics. Ensure the tone is neutral, factual, and suitable for an informative briefing",
  religion: "Provide a detailed overview of the country's religious landscape, focusing on the major faiths practiced, their historical significance, and their influence on the country's culture and society. Highlight key religious traditions, festivals, and practices, and discuss how they shape daily life and community interactions. Include an analysis of the role of religion in the country's governance, laws, or social norms, noting any historical or contemporary changes. Address any significant interfaith dynamics, including cooperation, tensions, or conflicts, and discuss their impact on social cohesion. Conclude with insights into how religion contributes to the country's identity and cultural heritage. Ensure the tone is neutral, factual, and suitable for an informative briefing.",
  economy: `Provide a detailed and structured overview of a country's economy, focusing on the following key elements:
	Economic Structure and Key Sectors
	•	Describe the main components of the country's Gross Domestic Product (GDP).
	•	Identify dominant industries and sectors (e.g., oil, agriculture, manufacturing, services).
	•	Discuss the role of these sectors in employment and economic output.

	Natural Resources and Export Profile
	•	Highlight any significant natural resources and their impact on the economy.
	•	Explain the composition of the country's exports and trade partners.
	•	Discuss how reliance on certain exports affects economic stability.

	Economic Challenges and Vulnerabilities
	•	Identify major economic challenges such as over-reliance on a single sector, unemployment, inflation, or public debt.
	•	Discuss issues like corruption, political instability, or infrastructure deficits.
	•	Analyze how these challenges impact overall economic performance.

	Historical and Political Influences
	•	Examine how historical events (e.g., wars, sanctions, regime changes) have shaped the current economic landscape.
	•	Discuss the impact of political decisions on economic policies and investor confidence.

	Diversification and Development Initiatives
	•	Describe government efforts to diversify the economy and promote sustainable growth.
	•	Highlight policies aimed at developing other sectors or improving the business environment.
	•	Discuss any obstacles to diversification efforts.

	Socioeconomic Indicators
	•	Provide data on unemployment rates, poverty levels, and income distribution.
	•	Discuss how economic conditions affect the standard of living and social welfare.

	Foreign Investment and International Assistance
	•	Analyze the role of foreign direct investment (FDI) in the economy.
	•	Mention any international aid or loans from organizations like the IMF or World Bank.
	•	Discuss how international relations influence economic opportunities.
    
	Future Outlook and Opportunities
	•	Assess the country's economic prospects based on current trends and potential reforms.
	•	Identify key opportunities for growth and development.
	•	Discuss the main obstacles that need to be addressed to achieve economic stability.
Ensure the tone is neutral, factual, and suitable for an informative briefing. Use specific examples and relevant data where appropriate to support your analysis.`,
  culture: "Provide a detailed overview of the country's cultural norms, traditions, and etiquette, including insights into social behavior, dining customs, and gift-giving practices. Discuss how cultural values influence interactions, such as respecting elders, gender roles, and hospitality. Highlight specific traditions or practices that are unique to the country, and explain their significance in everyday life. Include any notable figures or contributions in the country's cultural heritage, such as influential artists, poets, or actors. Structure the response with sections such as 'Basic Etiquette,' 'Visiting,' 'Eating,' 'Giving Gifts,' and 'Cultural Heritage.' Ensure the tone is neutral, factual, and suitable for an informative briefing.",
  media: "Explain the media landscape, press freedom, and major media outlets in",
  humanRights: `Provide a detailed and structured overview of the country's human rights situation, focusing on key developments over recent decades:

	Historical Context and Early Developments
	•	Discuss the country's human rights record during the early 2000s
	•	Highlight significant challenges or progress in civil liberties
	•	Detail notable policies and reforms

	Mid-Term Developments and Regional Influences
	•	Examine human rights dynamics during the 2010s
	•	Analyze impact of regional or global movements
	•	Detail significant reforms or government actions

	Recent Changes and Leadership Impact
	•	Analyze influence of recent leadership on human rights policies
	•	Highlight major achievements and ongoing areas of repression
	•	Detail social and political reforms

	Ongoing Challenges and Future Prospects
	•	Discuss current human rights challenges
	•	Explore balance between national interests and human rights
	•	Detail treatment of dissidents and political freedoms

	Key Cases and International Relations
	•	Include significant examples that have drawn attention
	•	Address influence on global relationships
	•	Detail interaction with advocacy groups and organizations

Ensure the tone is neutral, factual, and suitable for an informative briefing. Include specific examples and data where appropriate.`,
  history: "Provide a detailed overview of the modern history of the given country. It should be high quality written like an US intelligence analyst. Highlight major events such as regime changes, conflicts, international interventions, and significant movements or tensions within the population. Include the effects of these events on governance, the economy, and the country's stability. Ensure the tone is neutral, factual, informational, written like a CIA intelligence analyst.",
  humanDevelopment: "Provide a detailed overview of the country's human development trends since the year 2000, focusing on social, cultural, and technological advancements. Highlight key factors such as globalization, urbanization, and the rise of digital and social media in shaping societal norms and cultural expression. Discuss significant shifts in youth culture, arts, and literature, including the resurgence or transformation of traditional cultural practices. Include examples of how technology and social media platforms have influenced societal interactions, protest movements, or community-building efforts. Address challenges such as access to education, healthcare, traditional gender roles, and the impact of conflict or political instability on development. Conclude with an analysis of the opportunities and challenges facing the country in terms of social and cultural integration. Ensure the tone is neutral, factual, and suitable for an informative briefing.",
  diplomacy: "Provide a detailed overview of the country's diplomatic relations and regional dynamics, focusing on how internal political changes, conflicts, or governance transitions have influenced its relationships with neighboring countries and global powers. Highlight key alliances, tensions, and the impact of regional conflicts or international interventions on its diplomatic positioning. Include examples of how the country navigates relations with major regional actors, global powers, and international organizations. Conclude with an analysis of the country's current diplomatic challenges and opportunities. Ensure the tone is neutral, factual, and suitable for an informative briefing.",
  politicalLeadership: `Provide a detailed and structured overview of the country's political leadership, focusing on both the current government and key political figures or parties. Address the following elements:

	Government Structure
	•	Briefly describe the type of government (e.g., presidential republic, parliamentary democracy, monarchy)
	•	Detail the roles of key positions such as the head of state, head of government, and prominent cabinet members

	Major Political Figures
	•	Highlight key leaders, their roles, backgrounds, and contributions
	•	Include historical leaders or influential figures who have significantly shaped the political landscape

	Prominent Political Parties and Movements
	•	Describe the major political parties, coalitions, or movements, including their ideologies
	•	Include any notable political opposition or grassroots movements

	Recent Political Developments
	•	Discuss any major political events, reforms, or controversies involving the leadership
	•	Detail elections, public protests, or leadership transitions

	Interplay of Domestic and International Dynamics
	•	Analyze how political leadership interacts with domestic concerns and international relations

Include visual details where possible, key dates, and connections to broader political trends. Ensure the tone is neutral, factual, and appropriate for an informative briefing.`,
  militaryLeadership: `Provide a detailed and structured overview of the country's military leadership, focusing on the following elements:

	Military Structure
	•	Describe the organization of the country's armed forces, including all branches
	•	Detail any specialized units (e.g., cyber forces, special operations)

	Key Military Leaders
	•	Highlight significant figures in military leadership
	•	Include ranks, backgrounds, and notable contributions to military strategy

	Notable Military Institutions
	•	Discuss important military academies, strategic commands, or defense institutions
	•	Detail their role in the country's defense apparatus

	Role of the Military in Governance
	•	Analyze the military's influence on domestic politics
	•	Detail any historical involvement in political transitions or emergency rule

	Military-Related Alliances and Relations
	•	Highlight international alliances, peacekeeping missions, or defense agreements
	•	Analyze impact on country's security strategy

	Recent Military Developments
	•	Describe key events, reforms, or controversies
	•	Include details about military insignia and leadership structure

Ensure the tone is neutral, factual, and suitable for an informative briefing.`,
} as const;

export type SectionKey = keyof typeof SECTION_PROMPTS;

export async function startContentGeneration(country: string, section: SectionKey) {
  const prompt = SECTION_PROMPTS[section];
  if (!prompt) {
    throw new Error(`Invalid section: ${section}`);
  }

  // Create a generation record
  const generation = await db.contentGeneration.create({
    data: {
      status: 'PENDING',
      section,
      countryName: country,
    }
  });

  // Start the generation process in the background
  generateContent(generation.id, country, section).catch(error => {
    console.error('Error generating content:', error);
    db.contentGeneration.update({
      where: { id: generation.id },
      data: { 
        status: 'ERROR',
        error: error.message
      }
    });
  });

  return { generationId: generation.id };
}

export async function getGenerationStatus(generationId: string) {
  const generation = await db.contentGeneration.findUnique({
    where: { id: generationId }
  });

  if (!generation) {
    throw new Error('Generation not found');
  }

  return {
    status: generation.status,
    content: generation.content,
    error: generation.error
  };
}

async function generateContent(generationId: string, country: string, section: SectionKey) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a US intelligence analyst and expert in geopolitics helping to develop a country profile report with accurate, well-structured information. Provide detailed, factual information in a clear, professional tone, like a US intelligence analyst writing a report. Format the response as HTML."
        },
        {
          role: "user",
          content: `${SECTION_PROMPTS[section]}. The country you're working on is ${country}`
        }
      ]
    });

    let content = completion.choices[0].message.content || '';
    content = content.replace(/^```html\s*/g, '');
    content = content.replace(/```\s*$/g, '');
    content = content.trim();

    await db.contentGeneration.update({
      where: { id: generationId },
      data: {
        status: 'COMPLETED',
        content
      }
    });
  } catch (error) {
    await db.contentGeneration.update({
      where: { id: generationId },
      data: {
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
    throw error;
  }
} 