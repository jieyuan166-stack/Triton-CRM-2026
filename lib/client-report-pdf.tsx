import React from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { Carrier, Client, EmailHistoryEntry, Policy } from "@/lib/types";
import { formatDate as formatCalendarDate } from "@/lib/date-utils";
import { formatCurrency as formatMoney } from "@/lib/format";
import { calculatePortfolioMetrics } from "@/lib/portfolio-metrics";
import { displayPolicyNumber } from "@/lib/policy-number";

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    color: "#111827",
    fontSize: 10,
    backgroundColor: "#FFFFFF",
  },
  rule: {
    height: 4,
    backgroundColor: "#002147",
    borderRadius: 8,
    marginBottom: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 22,
  },
  logo: {
    width: 96,
    height: 96,
    objectFit: "contain",
  },
  meta: {
    textAlign: "right",
    color: "#64748B",
    fontSize: 9,
  },
  chip: {
    alignSelf: "flex-end",
    borderColor: "#D9E0E7",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#002147",
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 8,
  },
  eyebrow: {
    color: "#C9A227",
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  title: {
    color: "#002147",
    fontSize: 28,
    marginTop: 7,
    marginBottom: 6,
    fontFamily: "Helvetica",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 10.5,
    maxWidth: 420,
    marginBottom: 16,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  metric: {
    flex: 1,
    borderColor: "#E7EBEF",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#FBFCFD",
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  metricValue: {
    color: "#002147",
    fontSize: 16,
    fontWeight: 700,
    marginTop: 5,
  },
  section: {
    borderColor: "#E7EBEF",
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 10,
    overflow: "hidden",
  },
  sectionTitle: {
    backgroundColor: "#F8FAFC",
    borderBottomColor: "#E7EBEF",
    borderBottomWidth: 1,
    padding: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitleText: {
    color: "#002147",
    fontSize: 13,
    fontWeight: 700,
  },
  sectionNumber: {
    color: "#C9A227",
    fontSize: 8,
    fontWeight: 700,
  },
  sectionBody: {
    padding: 10,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  infoLabel: {
    width: 110,
    color: "#64748B",
    fontSize: 8.5,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomColor: "#E7EBEF",
    borderBottomWidth: 1,
    paddingBottom: 6,
    marginBottom: 3,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomColor: "#F1F5F9",
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  th: {
    color: "#64748B",
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: "uppercase",
  },
  td: {
    fontSize: 8.5,
    color: "#111827",
  },
  carrierCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  carrierLogoFrame: {
    width: 14,
    height: 14,
    borderColor: "#E2E8F0",
    borderWidth: 0.75,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 1,
  },
  carrierLogo: {
    width: 12,
    height: 12,
    objectFit: "contain",
  },
  carrierText: {
    flex: 1,
    fontSize: 8.5,
    color: "#111827",
  },
  footer: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 24,
    borderTopColor: "#E3C86A",
    borderTopWidth: 1,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
  },
  footerBrand: {
    color: "#002147",
    fontWeight: 700,
  },
  footerMeta: {
    color: "#A48928",
  },
  communicationList: {
    gap: 6,
  },
  communicationRow: {
    borderColor: "#E7EBEF",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#FBFCFD",
  },
  communicationDate: {
    color: "#64748B",
    fontSize: 8,
    marginBottom: 2,
  },
  communicationSubject: {
    color: "#002147",
    fontSize: 9,
    fontWeight: 700,
  },
  communicationPolicy: {
    color: "#64748B",
    fontSize: 8,
    marginTop: 2,
  },
  communicationBody: {
    color: "#334155",
    fontSize: 8,
    marginTop: 4,
    lineHeight: 1.35,
  },
  partyLine: {
    color: "#64748B",
    fontSize: 7,
    marginTop: 2,
    lineHeight: 1.25,
  },
  disclosure: {
    color: "#334155",
    fontSize: 10,
    lineHeight: 1.55,
    marginTop: 24,
  },
  disclosureParagraph: {
    marginBottom: 12,
  },
});

function clientName(client: Client) {
  return [client.firstName, client.lastName].filter(Boolean).join(" ").trim() || "Client";
}

function formatCurrency(value?: number) {
  return formatMoney(value ?? 0);
}

function formatDate(value?: string) {
  if (!value) return "Not provided";
  return formatCalendarDate(value, "en-CA");
}

function formatDateTime(value?: string) {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not provided";
  const day = formatCalendarDate(value, "en-CA");
  const time = date.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${time}`;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string | undefined, maxLength = 260) {
  const clean = stripHtml(value ?? "");
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}…`;
}

function communicationTitle(entry: EmailHistoryEntry) {
  const label = entry.templateLabel || entry.communicationType || "Activity";
  return `${label}: ${entry.subject || "No summary"}`;
}

function communicationPolicyContext(
  entry: EmailHistoryEntry,
  policies: Policy[]
) {
  const policy =
    (entry.policyId && policies.find((item) => item.id === entry.policyId)) ||
    (entry.policyNumber &&
      policies.find((item) => item.policyNumber === entry.policyNumber));
  if (policy) {
    return `${policy.carrier} · ${policy.productName || policy.productType} · #${policy.policyNumber}`;
  }
  if (entry.policyLabel || entry.policyNumber) {
    return [entry.policyLabel, entry.policyNumber ? `#${entry.policyNumber}` : ""]
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

function communicationAttachmentSummary(entry: EmailHistoryEntry) {
  if (!entry.attachments || entry.attachments.length === 0) return "";
  return `Attachments: ${entry.attachments
    .map((attachment) => attachment.filename)
    .filter(Boolean)
    .join(", ")}`;
}

function buildAddress(client: Client) {
  return [client.streetAddress, client.unit ? `Unit ${client.unit}` : "", client.city, client.province, client.postalCode]
    .filter(Boolean)
    .join(", ");
}

type ReportPolicy = Policy & { owner?: Client };

function policyPartySummary(policy: ReportPolicy) {
  const parts = [];
  const owners = [policy.policyOwnerName, policy.policyOwner2Name]
    .filter(Boolean)
    .join(" / ");
  if (owners) parts.push(`Owner: ${owners}`);
  const insured =
    policy.category === "Insurance"
      ? (policy.insuredPersons ?? [])
          .map((person) => person.name)
          .filter(Boolean)
          .join(" / ")
      : "";
  if (insured) parts.push(`Insured: ${insured}`);
  return parts.join(" · ");
}

type ReportFamily = {
  linkedClients?: Array<{ client: Client; relationship: string }>;
  policies?: ReportPolicy[];
  insuranceFaceAmount?: number;
  investmentAum?: number;
};

const columns = [
  { key: "carrier", width: "14%" },
  { key: "category", width: "12%" },
  { key: "product", width: "22%" },
  { key: "policy", width: "15%" },
  { key: "face", width: "14%" },
  { key: "premium", width: "12%" },
  { key: "status", width: "11%" },
];

function ReportHeader({
  logoDataUri,
  chip,
  name,
  generatedDate,
}: {
  logoDataUri?: string;
  chip: string;
  name?: string;
  generatedDate?: Date;
}) {
  return (
    <>
      <View style={styles.rule} />
      <View style={styles.header}>
        {logoDataUri ? <Image src={logoDataUri} style={styles.logo} /> : <Text>Triton Wealth</Text>}
        <View style={styles.meta}>
          <Text style={styles.chip}>{chip}</Text>
          {name ? <Text>Prepared for {name}</Text> : null}
          {generatedDate ? <Text>Generated {formatDate(generatedDate.toISOString())}</Text> : null}
        </View>
      </View>
    </>
  );
}

function ReportFooter({ label = "Confidential Portfolio Review" }: { label?: string }) {
  return (
    <View fixed style={styles.footer}>
      <Text style={styles.footerBrand}>Triton Wealth Management Corporation</Text>
      <Text style={styles.footerMeta}>{label}</Text>
    </View>
  );
}

function ProductTable({
  title,
  number,
  policies,
  carrierLogoDataUris,
  emptyMessage,
}: {
  title: string;
  number: string;
  policies: ReportPolicy[];
  carrierLogoDataUris?: Partial<Record<Carrier, string>>;
  emptyMessage: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitle}>
        <Text style={styles.sectionTitleText}>{title}</Text>
        <Text style={styles.sectionNumber}>{number}</Text>
      </View>
      <View style={styles.sectionBody}>
        <View style={styles.tableHeader}>
          {["Carrier", "Category", "Product", "Policy #", "Total Coverage", "Premium", "Status"].map((label, index) => (
            <Text key={label} style={[styles.th, { width: columns[index].width }]}>{label}</Text>
          ))}
        </View>
        {policies.length === 0 ? (
          <Text style={{ color: "#94A3B8", paddingVertical: 14, textAlign: "center" }}>
            {emptyMessage}
          </Text>
        ) : (
          policies.map((policy) => (
            <View key={policy.id} style={styles.tableRow} wrap={false}>
              <View style={[styles.carrierCell, { width: columns[0].width }]}>
                {carrierLogoDataUris?.[policy.carrier] ? (
                  <View style={styles.carrierLogoFrame}>
                    <Image
                      src={carrierLogoDataUris[policy.carrier]}
                      style={styles.carrierLogo}
                    />
                  </View>
                ) : null}
                <Text style={styles.carrierText}>{policy.carrier}</Text>
              </View>
              <Text style={[styles.td, { width: columns[1].width }]}>{policy.category}</Text>
              <View style={{ width: columns[2].width }}>
                <Text style={styles.td}>{policy.productName || policy.productType}</Text>
                {policyPartySummary(policy) ? (
                  <Text style={styles.partyLine}>{policyPartySummary(policy)}</Text>
                ) : null}
              </View>
              <Text style={[styles.td, { width: columns[3].width }]}>
                {displayPolicyNumber(policy.policyNumber)}
              </Text>
              <Text style={[styles.td, { width: columns[4].width }]}>
                {formatCurrency(policy.sumAssured)}
              </Text>
              <Text style={[styles.td, { width: columns[5].width }]}>
                {formatCurrency(policy.premium)}
              </Text>
              <Text style={[styles.td, { width: columns[6].width }]}>{policy.status || "active"}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function ReportDocument({
  client,
  policies,
  family,
  logoDataUri,
  carrierLogoDataUris,
  generatedDate,
}: {
  client: Client;
  policies: Policy[];
  family?: ReportFamily;
  logoDataUri?: string;
  carrierLogoDataUris?: Partial<Record<Carrier, string>>;
  generatedDate: Date;
}) {
  const reportPolicies = policies as ReportPolicy[];
  const hasFamily = Boolean(family?.linkedClients?.length);
  // Joint accounts are represented once in the Family Portfolio page rather
  // than being repeated under the primary client and the joint grouping.
  const clientPortfolioPolicies = hasFamily
    ? reportPolicies.filter((policy) => !policy.isJoint)
    : reportPolicies;
  const activeClientPolicies = clientPortfolioPolicies.filter((policy) => policy.status === "active");
  const clientMetrics = calculatePortfolioMetrics(activeClientPolicies);
  const totalPremium = activeClientPolicies.reduce((sum, policy) => sum + (policy.premium || 0), 0);
  const name = clientName(client);
  const communicationLog = [...(client.emailHistory ?? [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6);

  const familyPolicies = family?.policies ?? [];
  const familyIndividualGroups = (family?.linkedClients ?? []).map((link) => ({
    client: link.client,
    relationship: link.relationship,
    policies: familyPolicies.filter(
      (policy) => policy.owner?.id === link.client.id && !policy.isJoint
    ),
  }));
  const jointPolicies = familyPolicies.filter((policy) => policy.isJoint);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <ReportHeader
          logoDataUri={logoDataUri}
          chip="Portfolio Review"
          name={name}
          generatedDate={generatedDate}
        />

        <Text style={styles.eyebrow}>Individual Portfolio Review</Text>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.subtitle}>
          A concise relationship overview prepared for review, planning, and product record accuracy.
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Products</Text>
            <Text style={styles.metricValue}>{clientPortfolioPolicies.length}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Total Coverage</Text>
            <Text style={styles.metricValue}>{formatCurrency(clientMetrics.insuranceFaceAmount)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Investment AUM</Text>
            <Text style={styles.metricValue}>{formatCurrency(clientMetrics.investmentAum)}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Total Premium</Text>
            <Text style={styles.metricValue}>{formatCurrency(totalPremium)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Text style={styles.sectionTitleText}>Client Information</Text>
            <Text style={styles.sectionNumber}>01</Text>
          </View>
          <View style={styles.sectionBody}>
            {[
              ["Name", name],
              ["Email", client.email || "Not provided"],
              ["Phone", client.phone || "Not provided"],
              ["Birthday", formatDate(client.birthday)],
              ["Address", buildAddress(client) || "Not provided"],
            ].map(([label, value]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text>{value}</Text>
              </View>
            ))}
          </View>
        </View>

        <ProductTable
          title={hasFamily ? "Individual Products" : "Products"}
          number="02"
          policies={clientPortfolioPolicies}
          carrierLogoDataUris={carrierLogoDataUris}
          emptyMessage="No individual products recorded for this client."
        />

        <ReportFooter />
      </Page>

      {hasFamily ? (
        <Page size="A4" style={styles.page}>
          <ReportHeader
            logoDataUri={logoDataUri}
            chip="Family Portfolio"
            name={name}
            generatedDate={generatedDate}
          />
          <Text style={styles.eyebrow}>Direct Family Overview</Text>
          <Text style={styles.title}>Family Portfolio</Text>
          <Text style={styles.subtitle}>
            Directly linked family members and shared accounts, grouped for a complete household review.
          </Text>

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Linked Clients</Text>
              <Text style={styles.metricValue}>{family?.linkedClients?.length ?? 0}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Family Total Coverage</Text>
              <Text style={styles.metricValue}>{formatCurrency(family?.insuranceFaceAmount)}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Family Investment AUM</Text>
              <Text style={styles.metricValue}>{formatCurrency(family?.investmentAum)}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionTitleText}>Linked Clients</Text>
              <Text style={styles.sectionNumber}>03</Text>
            </View>
            <View style={styles.sectionBody}>
              {family?.linkedClients?.map((link) => (
                <View key={link.client.id} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{link.relationship}</Text>
                  <Text>{clientName(link.client)}</Text>
                </View>
              ))}
            </View>
          </View>

          {familyIndividualGroups.map((group, index) => (
            <ProductTable
              key={group.client.id}
              title={`${clientName(group.client)}'s Portfolio`}
              number={`0${index + 4}`}
              policies={group.policies}
              carrierLogoDataUris={carrierLogoDataUris}
              emptyMessage="No individual products recorded."
            />
          ))}

          <ProductTable
            title="Joint Accounts"
            number={`0${familyIndividualGroups.length + 4}`}
            policies={jointPolicies}
            carrierLogoDataUris={carrierLogoDataUris}
            emptyMessage="No joint products recorded."
          />

          <ReportFooter label="Confidential Family Portfolio" />
        </Page>
      ) : null}

      <Page size="A4" style={styles.page}>
        <ReportHeader logoDataUri={logoDataUri} chip="Disclosure" />
        <Text style={styles.eyebrow}>Important Information</Text>
        <Text style={styles.title}>Communication & Disclosure</Text>

        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Text style={styles.sectionTitleText}>Communication Log</Text>
            <Text style={styles.sectionNumber}>03</Text>
          </View>
          <View style={[styles.sectionBody, styles.communicationList]}>
            {communicationLog.length === 0 ? (
              <Text style={{ color: "#94A3B8", paddingVertical: 10, textAlign: "center" }}>
                No communication log entries recorded.
              </Text>
            ) : (
              communicationLog.map((entry) => (
                <View key={entry.id} style={styles.communicationRow}>
                  <Text style={styles.communicationDate}>{formatDateTime(entry.date)}</Text>
                  <Text style={styles.communicationSubject}>
                    {communicationTitle(entry)}
                  </Text>
                  {communicationPolicyContext(entry, policies) ? (
                    <Text style={styles.communicationPolicy}>
                      {communicationPolicyContext(entry, policies)}
                    </Text>
                  ) : null}
                  {compactText(entry.body) ? (
                    <Text style={styles.communicationBody}>
                      {compactText(entry.body)}
                    </Text>
                  ) : null}
                  {communicationAttachmentSummary(entry) ? (
                    <Text style={styles.communicationBody}>
                      {communicationAttachmentSummary(entry)}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>

        <Text style={[styles.eyebrow, { marginTop: 18 }]}>Disclosure</Text>
        <View style={styles.disclosure}>
          <Text style={styles.disclosureParagraph}>
            This report is provided for informational and review purposes only. It is not intended to constitute
            legal, tax, accounting, insurance, investment, or other professional advice. Product values, premiums,
            policy status, and other details should be verified against official carrier records before any decision
            is made.
          </Text>
          <Text style={styles.disclosureParagraph}>
            Insurance and investment products may involve risk, limitations, exclusions, fees, surrender charges,
            tax implications, and other considerations. Past performance, where applicable, is not a guarantee of
            future results.
          </Text>
          <Text style={styles.disclosureParagraph}>
            Confidentiality notice: this document contains private client information and is intended only for
            authorized recipients. If received in error, please delete it and notify the sender immediately.
          </Text>
        </View>
        <ReportFooter label="Confidential · Communication & Disclosure" />
      </Page>
    </Document>
  );
}

export async function renderClientReportPdf(input: {
  client: Client;
  policies: Policy[];
  family?: {
    linkedClients?: Array<{ client: Client; relationship: string }>;
    policies?: Array<Policy & { owner: Client }>;
    insuranceFaceAmount?: number;
    investmentAum?: number;
  };
  logoDataUri?: string;
  carrierLogoDataUris?: Partial<Record<Carrier, string>>;
  generatedDate?: Date;
}) {
  return renderToBuffer(
    <ReportDocument
      client={input.client}
      policies={input.policies}
      family={input.family}
      logoDataUri={input.logoDataUri}
      carrierLogoDataUris={input.carrierLogoDataUris}
      generatedDate={input.generatedDate ?? new Date()}
    />,
  );
}
