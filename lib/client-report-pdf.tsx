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

import type { Carrier, Client, Policy } from "@/lib/types";
import { formatDate as formatCalendarDate } from "@/lib/date-utils";
import { formatCurrency as formatMoney } from "@/lib/format";

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

function buildAddress(client: Client) {
  return [client.streetAddress, client.unit ? `Unit ${client.unit}` : "", client.city, client.province, client.postalCode]
    .filter(Boolean)
    .join(", ");
}

function policyPartySummary(policy: Policy) {
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
  family?: {
    linkedClients?: Array<{ client: Client; relationship: string }>;
    insuranceFaceAmount?: number;
    investmentAum?: number;
  };
  logoDataUri?: string;
  carrierLogoDataUris?: Partial<Record<Carrier, string>>;
  generatedDate: Date;
}) {
  const activePolicies = policies.filter((policy) => policy.status !== "lapsed");
  const totalFaceAmount = activePolicies.reduce((sum, policy) => sum + (policy.sumAssured || 0), 0);
  const totalPremium = activePolicies.reduce((sum, policy) => sum + (policy.premium || 0), 0);
  const name = clientName(client);
  const communicationLog = [...(client.emailHistory ?? [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 6);

  const columns = [
    { key: "carrier", width: "14%" },
    { key: "category", width: "12%" },
    { key: "product", width: "22%" },
    { key: "policy", width: "15%" },
    { key: "face", width: "14%" },
    { key: "premium", width: "12%" },
    { key: "status", width: "11%" },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.rule} />
        <View style={styles.header}>
          {logoDataUri ? <Image src={logoDataUri} style={styles.logo} /> : <Text>Triton Wealth</Text>}
          <View style={styles.meta}>
            <Text style={styles.chip}>Portfolio Review</Text>
            <Text>Prepared for {name}</Text>
            <Text>Generated {formatDate(generatedDate.toISOString())}</Text>
          </View>
        </View>

        <Text style={styles.eyebrow}>Client Portfolio Review</Text>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.subtitle}>
          A concise relationship overview prepared for review, planning, and product record accuracy.
        </Text>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Products</Text>
            <Text style={styles.metricValue}>{policies.length}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Total Death Benefit</Text>
            <Text style={styles.metricValue}>{formatCurrency(totalFaceAmount)}</Text>
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

        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <Text style={styles.sectionTitleText}>Products</Text>
            <Text style={styles.sectionNumber}>02</Text>
          </View>
          <View style={styles.sectionBody}>
            <View style={styles.tableHeader}>
              {["Carrier", "Category", "Product", "Policy #", "Death Benefit", "Premium", "Status"].map((label, index) => (
                <Text key={label} style={[styles.th, { width: columns[index].width }]}>{label}</Text>
              ))}
            </View>
            {policies.length === 0 ? (
              <Text style={{ color: "#94A3B8", paddingVertical: 14, textAlign: "center" }}>
                No products recorded for this client.
              </Text>
            ) : (
              policies.slice(0, 10).map((policy) => (
                <View key={policy.id} style={styles.tableRow}>
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
                    <Text style={styles.td}>{policy.productType}</Text>
                    {policyPartySummary(policy) ? (
                      <Text style={styles.partyLine}>{policyPartySummary(policy)}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.td, { width: columns[3].width }]}>{policy.policyNumber || "N/A"}</Text>
                  <Text style={[styles.td, { width: columns[4].width }]}>{formatCurrency(policy.sumAssured)}</Text>
                  <Text style={[styles.td, { width: columns[5].width }]}>{formatCurrency(policy.premium)}</Text>
                  <Text style={[styles.td, { width: columns[6].width }]}>{policy.status || "active"}</Text>
                </View>
              ))
            )}
          </View>
        </View>

        {family?.linkedClients?.length ? (
          <View style={styles.section}>
            <View style={styles.sectionTitle}>
              <Text style={styles.sectionTitleText}>Family Overview</Text>
              <Text style={styles.sectionNumber}>03</Text>
            </View>
            <View style={styles.sectionBody}>
              {family.linkedClients.map((link) => (
                <View key={link.client.id} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{link.relationship}</Text>
                  <Text>{clientName(link.client)}</Text>
                </View>
              ))}
              <View style={[styles.infoRow, { marginTop: 4 }]}>
                <Text style={styles.infoLabel}>Family Insurance</Text>
                <Text>{formatCurrency(family.insuranceFaceAmount ?? 0)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Family Investment</Text>
                <Text>{formatCurrency(family.investmentAum ?? 0)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Triton Wealth Management Corporation</Text>
          <Text style={styles.footerMeta}>Confidential Portfolio Review</Text>
        </View>
      </Page>

      <Page size="A4" style={styles.page}>
        <View style={styles.rule} />
        <View style={styles.header}>
          {logoDataUri ? <Image src={logoDataUri} style={styles.logo} /> : <Text>Triton Wealth</Text>}
          <View style={styles.meta}>
            <Text style={styles.chip}>Disclosure</Text>
          </View>
        </View>
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
                    {entry.templateLabel
                      ? `Sent "${entry.templateLabel}" Email`
                      : entry.subject || "Sent email"}
                  </Text>
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
        <View style={styles.footer}>
          <Text style={styles.footerBrand}>Triton Wealth Management Corporation</Text>
          <Text style={styles.footerMeta}>Page 2 · Confidential</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderClientReportPdf(input: {
  client: Client;
  policies: Policy[];
  family?: {
    linkedClients?: Array<{ client: Client; relationship: string }>;
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
