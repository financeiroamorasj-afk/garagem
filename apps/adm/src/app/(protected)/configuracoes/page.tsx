import { Bot, CreditCard, KeyRound, MessageCircle, Puzzle, ServerCog } from "lucide-react";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "@/lib/auth";
import { platformSettings, type PlatformIntegration } from "@/lib/data";
import { money } from "@/lib/format";

type VisibleIntegration = PlatformIntegration & { credentialConfigured: boolean; webhookSecretConfigured: boolean };

function StatusBadge({ status }: { status: string }) {
  const color = status === "ativo" ? "green" : status === "erro" ? "red" : status === "configurado" ? "blue" : "gold";
  return <span className={`badge ${color}`}>{status}</span>;
}

function SecretStatus({ label, reference, configured }: { label: string; reference: string | null; configured: boolean }) {
  if (!reference) return null;
  return (
    <div className="secret-row">
      <div><span className="config-label">{label}</span><code>{reference}</code></div>
      <span className={`badge ${configured ? "green" : "red"}`}>{configured ? "configurada" : "ausente"}</span>
    </div>
  );
}

function IntegrationCard({ integration, icon }: { integration: VisibleIntegration; icon: ReactNode }) {
  return (
    <article className="config-card">
      <div className="config-card-heading">
        <div className="config-icon">{icon}</div>
        <div className="config-title"><h3>{integration.nome}</h3><p>{integration.categoria.replaceAll("_", " ")}</p></div>
        <StatusBadge status={integration.status} />
      </div>
      <div className="config-grid">
        <div><span className="config-label">Provedor</span><strong>{integration.provider}</strong></div>
        <div><span className="config-label">Ambiente</span><strong>{integration.ambiente}</strong></div>
        <div className="config-wide"><span className="config-label">Endpoint</span><code>{integration.base_url ?? "A definir"}</code></div>
      </div>
      <div className="secret-list">
        <SecretStatus label="Credencial da API" reference={integration.credencial_ref} configured={integration.credentialConfigured} />
        <SecretStatus label="Segredo do webhook" reference={integration.webhook_secret_ref} configured={integration.webhookSecretConfigured} />
      </div>
    </article>
  );
}

export default async function SettingsPage() {
  await requirePlatformAdmin(["super_admin"]);
  const { modules, integrations } = await platformSettings();
  const gateways = integrations.filter((item) => item.categoria === "gateway_assinaturas");
  const artificialIntelligence = integrations.filter((item) => item.categoria.startsWith("ia_"));

  return (
    <>
      <header className="page-header">
        <div><span className="eyebrow">Infraestrutura comercial</span><h1 className="page-title">Configurações</h1><p className="page-description">Provedores, módulos contratáveis e APIs que sustentam os complementos do Garagem.</p></div>
      </header>
      <div className="notice">As chaves não ficam no banco. O ADM registra somente qual variável segura deve existir no servidor e mostra seu estado, sem revelar o conteúdo.</div>

      <section className="settings-section">
        <div className="section-heading"><div><span className="eyebrow">Cobrança SaaS</span><h2>Gateway de assinaturas</h2></div><CreditCard size={22} /></div>
        <p className="section-description">O Asaas é o adaptador inicial. O cadastro por provedor permite substituí-lo futuramente sem refazer planos, checkouts ou assinaturas.</p>
        <div className="config-cards">
          {gateways.map((integration) => <IntegrationCard key={integration.id} integration={integration} icon={<ServerCog size={21} />} />)}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading"><div><span className="eyebrow">Catálogo comercial</span><h2>Controle de módulos</h2></div><Puzzle size={22} /></div>
        <p className="section-description">Este catálogo será usado para incluir recursos nos planos ou liberá-los como adicionais em cada assinatura.</p>
        <div className="module-grid">
          {modules.map((module) => (
            <article className="module-card" key={module.id}>
              <div className="module-card-top"><div><h3>{module.nome}</h3><code>{module.codigo}</code></div><StatusBadge status={module.status} /></div>
              <p>{module.descricao ?? "Sem descrição."}</p>
              <div className="module-meta"><span>Entitlement <strong>{module.entitlement_codigo ?? "a definir"}</strong></span><span>Adicional <strong>{module.preco_mensal == null ? "Preço a definir" : money(module.preco_mensal)}</strong></span></div>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading"><div><span className="eyebrow">Próximos complementos</span><h2>APIs e inteligências artificiais</h2></div><Bot size={22} /></div>
        <p className="section-description">As IAs de gestão e de atendimento são integrações independentes. Cada uma poderá ter provedor, modelo, limites e custos próprios.</p>
        <div className="config-cards">
          {artificialIntelligence.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} icon={integration.categoria.includes("whatsapp") ? <MessageCircle size={21} /> : <KeyRound size={21} />} />
          ))}
        </div>
        <div className="roadmap-note"><strong>Preparado para a próxima etapa:</strong> seleção de modelo, limite mensal por assinatura, canal oficial do WhatsApp, teste de conexão e medição de consumo.</div>
      </section>
    </>
  );
}
