// SAP BTP Deployment Service
// Ermöglicht das Deployment von CAP und Fiori Apps zur SAP Business Technology Platform

export interface BTPCredentials {
  apiEndpoint: string      // z.B. https://api.cf.eu10.hana.ondemand.com
  org: string              // Organisation
  space: string            // Space (dev, test, prod)
  username: string         // SAP BTP Username (Email)
  password: string         // SAP BTP Password oder API Token
}

export interface BTPDeploymentConfig {
  projectPath: string
  projectType: "cap" | "fiori" | "mta"
  appName: string
  credentials: BTPCredentials
  buildBeforeDeploy?: boolean
  useHANA?: boolean
  serviceBindings?: string[]
}

export interface BTPDeploymentResult {
  success: boolean
  appUrl?: string
  logs: string[]
  error?: string
  duration?: number
}

export interface BTPService {
  name: string
  plan: string
  instance?: string
}

// Standard BTP Services für SAP Apps
export const BTP_SERVICES: Record<string, BTPService[]> = {
  cap: [
    { name: "hana", plan: "hdi-shared", instance: "hana-db" },
    { name: "xsuaa", plan: "application", instance: "uaa-service" },
    { name: "destination", plan: "lite", instance: "dest-service" },
  ],
  fiori: [
    { name: "html5-apps-repo", plan: "app-host", instance: "html5-host" },
    { name: "xsuaa", plan: "application", instance: "uaa-service" },
    { name: "destination", plan: "lite", instance: "dest-service" },
  ],
  mta: [
    { name: "hana", plan: "hdi-shared", instance: "hana-db" },
    { name: "xsuaa", plan: "application", instance: "uaa-service" },
    { name: "html5-apps-repo", plan: "app-host", instance: "html5-host" },
    { name: "destination", plan: "lite", instance: "dest-service" },
  ],
}

// BTP Regions mit API Endpoints
export const BTP_REGIONS = [
  { id: "eu10", name: "Europe (Frankfurt)", apiEndpoint: "https://api.cf.eu10.hana.ondemand.com" },
  { id: "eu20", name: "Europe (Netherlands)", apiEndpoint: "https://api.cf.eu20.hana.ondemand.com" },
  { id: "us10", name: "US East (VA)", apiEndpoint: "https://api.cf.us10.hana.ondemand.com" },
  { id: "us20", name: "US West (WA)", apiEndpoint: "https://api.cf.us20.hana.ondemand.com" },
  { id: "ap10", name: "Australia (Sydney)", apiEndpoint: "https://api.cf.ap10.hana.ondemand.com" },
  { id: "ap11", name: "Singapore", apiEndpoint: "https://api.cf.ap11.hana.ondemand.com" },
  { id: "ap12", name: "South Korea (Seoul)", apiEndpoint: "https://api.cf.ap12.hana.ondemand.com" },
  { id: "jp10", name: "Japan (Tokyo)", apiEndpoint: "https://api.cf.jp10.hana.ondemand.com" },
  { id: "br10", name: "Brazil (São Paulo)", apiEndpoint: "https://api.cf.br10.hana.ondemand.com" },
]

// Generiere mta.yaml für Multi-Target Application
export function generateMtaYaml(config: {
  appName: string
  projectType: "cap" | "fiori"
  useHANA?: boolean
}): string {
  const { appName, projectType, useHANA } = config
  
  if (projectType === "cap") {
    return `_schema-version: "3.1"
ID: ${appName}
version: 1.0.0
description: ${appName} CAP Application

parameters:
  enable-parallel-deployments: true

build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npx cds build --production

modules:
  # Backend Service
  - name: ${appName}-srv
    type: nodejs
    path: gen/srv
    parameters:
      buildpack: nodejs_buildpack
      memory: 256M
    build-parameters:
      builder: npm
    provides:
      - name: srv-api
        properties:
          srv-url: \${default-url}
    requires:
      - name: ${appName}-auth
${useHANA ? `      - name: ${appName}-db` : ""}
      - name: ${appName}-destination

${useHANA ? `  # Database Deployer
  - name: ${appName}-db-deployer
    type: hdb
    path: gen/db
    parameters:
      buildpack: nodejs_buildpack
    requires:
      - name: ${appName}-db
` : ""}
  # App Router (UI)
  - name: ${appName}-app
    type: approuter.nodejs
    path: app
    parameters:
      keep-existing-routes: true
      disk-quota: 256M
      memory: 256M
    requires:
      - name: srv-api
        group: destinations
        properties:
          name: srv-api
          url: ~{srv-url}
          forwardAuthToken: true
      - name: ${appName}-auth

resources:
  # XSUAA Service
  - name: ${appName}-auth
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json
      config:
        xsappname: ${appName}-\${org}-\${space}
        tenant-mode: dedicated

${useHANA ? `  # HANA HDI Container
  - name: ${appName}-db
    type: com.sap.xs.hdi-container
    parameters:
      service: hana
      service-plan: hdi-shared
` : ""}
  # Destination Service
  - name: ${appName}-destination
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-plan: lite
`
  }

  // Fiori MTA
  return `_schema-version: "3.1"
ID: ${appName}
version: 1.0.0
description: ${appName} Fiori Application

parameters:
  enable-parallel-deployments: true
  deploy_mode: html5-repo

build-parameters:
  before-all:
    - builder: custom
      commands:
        - npm ci
        - npm run build

modules:
  # Fiori App
  - name: ${appName}-app
    type: html5
    path: dist
    build-parameters:
      build-result: dist
      builder: custom
      commands:
        - npm run build:cf
    requires:
      - name: ${appName}-html5-host

  # App Router
  - name: ${appName}-router
    type: approuter.nodejs
    path: router
    parameters:
      disk-quota: 256M
      memory: 256M
    requires:
      - name: ${appName}-html5-runtime
      - name: ${appName}-auth
      - name: ${appName}-destination

resources:
  # HTML5 App Host
  - name: ${appName}-html5-host
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-host

  # HTML5 Runtime
  - name: ${appName}-html5-runtime
    type: org.cloudfoundry.managed-service
    parameters:
      service: html5-apps-repo
      service-plan: app-runtime

  # XSUAA
  - name: ${appName}-auth
    type: org.cloudfoundry.managed-service
    parameters:
      service: xsuaa
      service-plan: application
      path: ./xs-security.json

  # Destination
  - name: ${appName}-destination
    type: org.cloudfoundry.managed-service
    parameters:
      service: destination
      service-plan: lite
`
}

// Generiere xs-security.json für XSUAA
export function generateXsSecurityJson(appName: string): string {
  return JSON.stringify({
    "xsappname": appName,
    "tenant-mode": "dedicated",
    "scopes": [
      {
        "name": "$XSAPPNAME.admin",
        "description": "Admin Scope"
      },
      {
        "name": "$XSAPPNAME.user",
        "description": "User Scope"
      }
    ],
    "role-templates": [
      {
        "name": "Admin",
        "description": "Administrator",
        "scope-references": ["$XSAPPNAME.admin"]
      },
      {
        "name": "User",
        "description": "Standard User",
        "scope-references": ["$XSAPPNAME.user"]
      }
    ],
    "role-collections": [
      {
        "name": `${appName}_Admin`,
        "description": "Admin Role Collection",
        "role-template-references": ["$XSAPPNAME.Admin"]
      },
      {
        "name": `${appName}_User`,
        "description": "User Role Collection",
        "role-template-references": ["$XSAPPNAME.User"]
      }
    ]
  }, null, 2)
}

// Cloud Foundry Commands
export const CF_COMMANDS = {
  login: (creds: BTPCredentials) => 
    `cf login -a ${creds.apiEndpoint} -u ${creds.username} -p "${creds.password}" -o ${creds.org} -s ${creds.space}`,
  
  push: (appName: string) => 
    `cf push ${appName}`,
  
  mtaBuild: () => 
    `mbt build -t ./mta_archives`,
  
  mtaDeploy: (mtarPath: string) => 
    `cf deploy ${mtarPath} -f`,
  
  createService: (service: string, plan: string, instance: string) => 
    `cf create-service ${service} ${plan} ${instance}`,
  
  logs: (appName: string) => 
    `cf logs ${appName} --recent`,
  
  apps: () => 
    `cf apps`,
  
  services: () => 
    `cf services`,
}

// Validiere BTP Credentials
export function validateBTPCredentials(creds: Partial<BTPCredentials>): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!creds.apiEndpoint) errors.push("API Endpoint fehlt")
  if (!creds.org) errors.push("Organisation fehlt")
  if (!creds.space) errors.push("Space fehlt")
  if (!creds.username) errors.push("Username fehlt")
  if (!creds.password) errors.push("Password fehlt")
  
  if (creds.apiEndpoint && !creds.apiEndpoint.startsWith("https://api.cf.")) {
    errors.push("Ungültiger API Endpoint (muss mit https://api.cf. beginnen)")
  }
  
  return { valid: errors.length === 0, errors }
}

// Deployment Status
export type DeploymentStatus = "idle" | "building" | "deploying" | "success" | "error"

export interface DeploymentState {
  status: DeploymentStatus
  step: string
  progress: number
  logs: string[]
  error?: string
  startTime?: Date
  endTime?: Date
  appUrl?: string
}
