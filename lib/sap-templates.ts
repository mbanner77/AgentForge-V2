// SAP Project Templates für verschiedene SAP-Technologien

export interface SAPProjectTemplate {
  id: string
  name: string
  description: string
  type: "cap" | "ui5" | "fiori" | "mdk"
  files: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

// CAP Project Template
export const CAP_BOOKSHOP_TEMPLATE: SAPProjectTemplate = {
  id: "cap-bookshop",
  name: "CAP Bookshop",
  description: "SAP CAP Beispielprojekt mit Books und Authors",
  type: "cap",
  files: {
    "package.json": `{
  "name": "bookshop",
  "version": "1.0.0",
  "description": "SAP CAP Bookshop Sample",
  "repository": "https://github.com/sap-samples/cloud-cap-samples",
  "license": "SAP SAMPLE CODE LICENSE",
  "private": true,
  "dependencies": {
    "@sap/cds": "^7",
    "express": "^4"
  },
  "devDependencies": {
    "@cap-js/sqlite": "^1"
  },
  "scripts": {
    "start": "cds-serve",
    "watch": "cds watch"
  },
  "cds": {
    "requires": {
      "db": "sqlite"
    }
  }
}`,
    "db/schema.cds": `namespace sap.capire.bookshop;

entity Books {
  key ID : UUID;
  title  : String(111);
  descr  : String(1111);
  author : Association to Authors;
  stock  : Integer;
  price  : Decimal(9,2);
}

entity Authors {
  key ID : UUID;
  name   : String(111);
  books  : Association to many Books on books.author = $self;
}

entity Orders {
  key ID   : UUID;
  book     : Association to Books;
  quantity : Integer;
  createdAt : DateTime @cds.on.insert: $now;
}`,
    "srv/cat-service.cds": `using { sap.capire.bookshop as my } from '../db/schema';

service CatalogService @(path:'/browse') {
  @readonly entity Books as projection on my.Books { *,
    author.name as authorName
  } excluding { author };
  
  @requires: 'authenticated-user'
  action submitOrder (book: Books:ID, quantity: Integer) returns { succeeded: Boolean };
}

service AdminService @(requires:'admin') {
  entity Books as projection on my.Books;
  entity Authors as projection on my.Authors;
}`,
    "srv/cat-service.js": `const cds = require('@sap/cds')

module.exports = class CatalogService extends cds.ApplicationService {
  init() {
    const { Books } = this.entities

    // Reduce stock on order
    this.on('submitOrder', async (req) => {
      const { book, quantity } = req.data
      const n = await UPDATE(Books, book)
        .with({ stock: { '-=': quantity }})
        .where({ stock: { '>=': quantity }})
      if (n === 0) req.error(409, \`\${quantity} exceeds stock for book #\${book}\`)
      return { succeeded: n > 0 }
    })

    // Add discount for overstocked books
    this.after('READ', 'Books', each => {
      if (each.stock > 111) each.title += ' -- 11% discount!'
    })

    return super.init()
  }
}`,
    "db/data/sap.capire.bookshop-Books.csv": `ID;title;author_ID;stock;price
1;Wuthering Heights;101;12;11.11
2;Jane Eyre;101;11;12.34
3;The Raven;102;333;13.13
4;Eleonora;102;555;14.14
5;Catweazle;103;22;15.15`,
    "db/data/sap.capire.bookshop-Authors.csv": `ID;name
101;Emily Brontë
102;Edgar Allen Poe
103;Richard Carpenter`,
    ".cdsrc.json": `{
  "build": {
    "target": "."
  },
  "hana": {
    "deploy-format": "hdbtable"
  }
}`,
    "README.md": `# CAP Bookshop Sample

## Getting Started

\`\`\`bash
npm install
cds watch
\`\`\`

## Services

- **CatalogService**: Browse books at /browse
- **AdminService**: Admin operations at /admin

## Data Model

- **Books**: Book catalog with title, description, price, stock
- **Authors**: Author information
- **Orders**: Order tracking
`,
  },
}

// UI5 Freestyle Template
export const UI5_FREESTYLE_TEMPLATE: SAPProjectTemplate = {
  id: "ui5-freestyle",
  name: "UI5 Freestyle App",
  description: "SAPUI5 Freestyle Anwendung mit MVC Pattern",
  type: "ui5",
  files: {
    "package.json": `{
  "name": "ui5-freestyle-app",
  "version": "1.0.0",
  "description": "SAPUI5 Freestyle Application",
  "scripts": {
    "start": "ui5 serve",
    "build": "ui5 build",
    "lint": "eslint webapp"
  },
  "devDependencies": {
    "@ui5/cli": "^3.0.0",
    "@sap/ux-ui5-tooling": "^1",
    "eslint": "^8"
  }
}`,
    "ui5.yaml": `specVersion: "3.0"
metadata:
  name: ui5-freestyle-app
type: application
framework:
  name: SAPUI5
  version: "1.120.0"
  libraries:
    - name: sap.m
    - name: sap.ui.core
    - name: sap.ui.layout`,
    "webapp/manifest.json": `{
  "_version": "1.58.0",
  "sap.app": {
    "id": "com.example.ui5app",
    "type": "application",
    "title": "UI5 Freestyle App",
    "description": "SAPUI5 Freestyle Application",
    "applicationVersion": {
      "version": "1.0.0"
    }
  },
  "sap.ui": {
    "technology": "UI5",
    "deviceTypes": {
      "desktop": true,
      "tablet": true,
      "phone": true
    }
  },
  "sap.ui5": {
    "rootView": {
      "viewName": "com.example.ui5app.view.App",
      "type": "XML",
      "id": "app"
    },
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.ui.layout": {}
      }
    },
    "models": {
      "i18n": {
        "type": "sap.ui.model.resource.ResourceModel",
        "settings": {
          "bundleName": "com.example.ui5app.i18n.i18n"
        }
      }
    },
    "routing": {
      "config": {
        "routerClass": "sap.m.routing.Router",
        "viewType": "XML",
        "viewPath": "com.example.ui5app.view",
        "controlId": "app",
        "controlAggregation": "pages"
      },
      "routes": [
        {
          "name": "main",
          "pattern": "",
          "target": "main"
        }
      ],
      "targets": {
        "main": {
          "viewName": "Main",
          "viewLevel": 1
        }
      }
    }
  }
}`,
    "webapp/Component.js": `sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function(UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("com.example.ui5app.Component", {
    metadata: {
      manifest: "json"
    },

    init: function() {
      UIComponent.prototype.init.apply(this, arguments);
      
      // Initialize router
      this.getRouter().initialize();
      
      // Set device model
      var oDeviceModel = new JSONModel({
        isPhone: sap.ui.Device.system.phone,
        isDesktop: sap.ui.Device.system.desktop
      });
      this.setModel(oDeviceModel, "device");
    }
  });
});`,
    "webapp/view/App.view.xml": `<mvc:View
  controllerName="com.example.ui5app.controller.App"
  xmlns:mvc="sap.ui.core.mvc"
  xmlns="sap.m">
  <App id="app">
    <pages>
      <!-- Pages will be added by router -->
    </pages>
  </App>
</mvc:View>`,
    "webapp/view/Main.view.xml": `<mvc:View
  controllerName="com.example.ui5app.controller.Main"
  xmlns:mvc="sap.ui.core.mvc"
  xmlns="sap.m">
  <Page title="{i18n>title}">
    <content>
      <VBox class="sapUiMediumMargin">
        <Title text="{i18n>welcomeTitle}" class="sapUiSmallMarginBottom"/>
        <Text text="{i18n>welcomeText}"/>
        <Button 
          text="{i18n>buttonText}" 
          press=".onPress"
          class="sapUiSmallMarginTop"
          type="Emphasized"/>
      </VBox>
    </content>
  </Page>
</mvc:View>`,
    "webapp/controller/App.controller.js": `sap.ui.define([
  "sap/ui/core/mvc/Controller"
], function(Controller) {
  "use strict";

  return Controller.extend("com.example.ui5app.controller.App", {
    onInit: function() {
      // App controller initialization
    }
  });
});`,
    "webapp/controller/Main.controller.js": `sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast"
], function(Controller, MessageToast) {
  "use strict";

  return Controller.extend("com.example.ui5app.controller.Main", {
    onInit: function() {
      // Main view initialization
    },

    onPress: function() {
      MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("buttonPressed"));
    }
  });
});`,
    "webapp/i18n/i18n.properties": `title=UI5 Freestyle App
welcomeTitle=Welcome to SAPUI5
welcomeText=This is a freestyle UI5 application following the MVC pattern.
buttonText=Click Me
buttonPressed=Button was pressed!`,
    "webapp/index.html": `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI5 Freestyle App</title>
  <script
    id="sap-ui-bootstrap"
    src="https://ui5.sap.com/resources/sap-ui-core.js"
    data-sap-ui-theme="sap_horizon"
    data-sap-ui-resourceroots='{"com.example.ui5app": "./"}'
    data-sap-ui-compatVersion="edge"
    data-sap-ui-async="true"
    data-sap-ui-frameOptions="trusted">
  </script>
  <script>
    sap.ui.getCore().attachInit(function() {
      sap.ui.require(["sap/ui/core/ComponentContainer"], function(ComponentContainer) {
        new ComponentContainer({
          name: "com.example.ui5app",
          settings: { id: "ui5app" },
          async: true
        }).placeAt("content");
      });
    });
  </script>
</head>
<body class="sapUiBody" id="content">
</body>
</html>`,
    "README.md": `# UI5 Freestyle Application

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

Open http://localhost:8080/index.html

## Structure

- **webapp/**: Application source code
- **view/**: XML views
- **controller/**: JavaScript controllers
- **i18n/**: Internationalization
`,
  },
}

// Fiori Elements List Report Template
export const FIORI_LIST_REPORT_TEMPLATE: SAPProjectTemplate = {
  id: "fiori-list-report",
  name: "Fiori List Report",
  description: "SAP Fiori Elements List Report mit Object Page",
  type: "fiori",
  files: {
    "package.json": `{
  "name": "fiori-list-report",
  "version": "1.0.0",
  "description": "SAP Fiori Elements List Report",
  "scripts": {
    "start": "fiori run --open 'test/flpSandbox.html#fiori-list-report-tile'",
    "build": "ui5 build --config=ui5.yaml --clean-dest --dest dist"
  },
  "devDependencies": {
    "@sap/ux-specification": "^1",
    "@ui5/cli": "^3.0.0",
    "@sap-ux/ui5-middleware-fe-mockserver": "^2"
  }
}`,
    "ui5.yaml": `specVersion: "3.0"
metadata:
  name: fiori-list-report
type: application
framework:
  name: SAPUI5
  version: "1.120.0"
  libraries:
    - name: sap.m
    - name: sap.ui.core
    - name: sap.ushell
    - name: sap.fe.templates`,
    "webapp/manifest.json": `{
  "_version": "1.58.0",
  "sap.app": {
    "id": "com.example.listreport",
    "type": "application",
    "title": "Products List Report",
    "description": "Fiori Elements List Report",
    "dataSources": {
      "mainService": {
        "uri": "/sap/opu/odata4/sap/products/",
        "type": "OData",
        "settings": {
          "odataVersion": "4.0",
          "localUri": "localService/metadata.xml"
        }
      }
    }
  },
  "sap.ui5": {
    "dependencies": {
      "minUI5Version": "1.120.0",
      "libs": {
        "sap.m": {},
        "sap.ui.core": {},
        "sap.fe.templates": {}
      }
    },
    "models": {
      "": {
        "dataSource": "mainService",
        "settings": {
          "synchronizationMode": "None",
          "operationMode": "Server",
          "autoExpandSelect": true,
          "earlyRequests": true
        }
      }
    },
    "routing": {
      "routes": [
        {
          "pattern": ":?query:",
          "name": "ProductsList",
          "target": "ProductsList"
        },
        {
          "pattern": "Products({key}):?query:",
          "name": "ProductsObjectPage",
          "target": "ProductsObjectPage"
        }
      ],
      "targets": {
        "ProductsList": {
          "type": "Component",
          "id": "ProductsList",
          "name": "sap.fe.templates.ListReport",
          "options": {
            "settings": {
              "entitySet": "Products",
              "variantManagement": "Page",
              "navigation": {
                "Products": {
                  "detail": {
                    "route": "ProductsObjectPage"
                  }
                }
              }
            }
          }
        },
        "ProductsObjectPage": {
          "type": "Component",
          "id": "ProductsObjectPage",
          "name": "sap.fe.templates.ObjectPage",
          "options": {
            "settings": {
              "entitySet": "Products"
            }
          }
        }
      }
    }
  }
}`,
    "webapp/Component.js": `sap.ui.define([
  "sap/fe/core/AppComponent"
], function(AppComponent) {
  "use strict";

  return AppComponent.extend("com.example.listreport.Component", {
    metadata: {
      manifest: "json"
    }
  });
});`,
    "webapp/localService/metadata.xml": `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="ProductService" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Product">
        <Key>
          <PropertyRef Name="ID"/>
        </Key>
        <Property Name="ID" Type="Edm.Guid" Nullable="false"/>
        <Property Name="name" Type="Edm.String" MaxLength="100"/>
        <Property Name="description" Type="Edm.String" MaxLength="1000"/>
        <Property Name="price" Type="Edm.Decimal" Precision="9" Scale="2"/>
        <Property Name="currency" Type="Edm.String" MaxLength="3"/>
        <Property Name="stock" Type="Edm.Int32"/>
        <Property Name="category" Type="Edm.String" MaxLength="50"/>
      </EntityType>
      <EntityContainer Name="ProductService">
        <EntitySet Name="Products" EntityType="ProductService.Product"/>
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`,
    "webapp/annotations/annotation.xml": `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:Reference Uri="/sap/opu/odata4/sap/products/$metadata">
    <edmx:Include Namespace="ProductService"/>
  </edmx:Reference>
  <edmx:DataServices>
    <Schema Namespace="local" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <Annotations Target="ProductService.Product">
        <Annotation Term="UI.LineItem">
          <Collection>
            <Record Type="UI.DataField">
              <PropertyValue Property="Value" Path="name"/>
              <PropertyValue Property="Label" String="Product Name"/>
            </Record>
            <Record Type="UI.DataField">
              <PropertyValue Property="Value" Path="category"/>
              <PropertyValue Property="Label" String="Category"/>
            </Record>
            <Record Type="UI.DataField">
              <PropertyValue Property="Value" Path="price"/>
              <PropertyValue Property="Label" String="Price"/>
            </Record>
            <Record Type="UI.DataField">
              <PropertyValue Property="Value" Path="stock"/>
              <PropertyValue Property="Label" String="Stock"/>
            </Record>
          </Collection>
        </Annotation>
        <Annotation Term="UI.HeaderInfo">
          <Record Type="UI.HeaderInfoType">
            <PropertyValue Property="TypeName" String="Product"/>
            <PropertyValue Property="TypeNamePlural" String="Products"/>
            <PropertyValue Property="Title">
              <Record Type="UI.DataField">
                <PropertyValue Property="Value" Path="name"/>
              </Record>
            </PropertyValue>
          </Record>
        </Annotation>
      </Annotations>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`,
    "README.md": `# Fiori Elements List Report

## Getting Started

\`\`\`bash
npm install
npm start
\`\`\`

## Features

- List Report with filtering and sorting
- Object Page for product details
- OData V4 based

## Annotations

UI annotations are defined in \`webapp/annotations/annotation.xml\`
`,
  },
}

// All templates
export const SAP_PROJECT_TEMPLATES: SAPProjectTemplate[] = [
  CAP_BOOKSHOP_TEMPLATE,
  UI5_FREESTYLE_TEMPLATE,
  FIORI_LIST_REPORT_TEMPLATE,
]

// Get template by ID
export function getSAPTemplate(id: string): SAPProjectTemplate | undefined {
  return SAP_PROJECT_TEMPLATES.find(t => t.id === id)
}

// Get templates by type
export function getSAPTemplatesByType(type: SAPProjectTemplate["type"]): SAPProjectTemplate[] {
  return SAP_PROJECT_TEMPLATES.filter(t => t.type === type)
}

// Generate files from template
export function generateFilesFromTemplate(template: SAPProjectTemplate): Map<string, string> {
  return new Map(Object.entries(template.files))
}
