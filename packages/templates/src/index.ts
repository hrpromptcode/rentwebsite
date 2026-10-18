import type { TemplateDefinition } from "@rentweb/core/tenant";
import { shop } from "./shop";
import { topup } from "./topup";
import { clinic } from "./clinic";
import { restaurant } from "./restaurant";
import { salon } from "./salon";
import { corporate } from "./corporate";
import { cafe } from "./cafe";
import { course } from "./course";
import { hotel } from "./hotel";
import { eventsTemplate } from "./events";

export const TEMPLATES: Record<string, TemplateDefinition> = {
  shop,
  topup,
  clinic,
  restaurant,
  salon,
  corporate,
  cafe,
  course,
  hotel,
  events: eventsTemplate,
};

export function listTemplates(): TemplateDefinition[] {
  return Object.values(TEMPLATES);
}

export function getTemplate(key: string): TemplateDefinition | undefined {
  return TEMPLATES[key];
}

export type { TemplateDefinition };
