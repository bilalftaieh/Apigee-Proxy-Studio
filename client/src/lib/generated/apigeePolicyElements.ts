// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced by scripts/generate-policy-schemas.mjs from the Apigee X policy
// reference at https://cloud.google.com/apigee/docs/api-platform/reference/policies.
// Re-run `npm run generate:policy-schemas` to refresh.
//
// 59 of 60 policy root tags, 744 elements, 198 with documentation.
// Not covered here: PythonScript.

import type { XmlElementDef } from '../policyXmlSchema';

export const GENERATED_POLICY_ELEMENTS: Record<string, XmlElementDef> = {
  "AccessControl": {
    "name": "AccessControl",
    "children": [
      {
        "name": "IPRules",
        "attrs": [
          {
            "name": "noRuleMatchAction"
          }
        ],
        "children": [
          {
            "name": "MatchRule",
            "attrs": [
              {
                "name": "action"
              }
            ],
            "repeatable": true,
            "children": [
              {
                "name": "SourceAddress",
                "attrs": [
                  {
                    "name": "mask"
                  }
                ],
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "ValidateBasedOn"
      },
      {
        "name": "ClientIPVariable"
      }
    ]
  },
  "AccessEntity": {
    "name": "AccessEntity",
    "children": [
      {
        "name": "EntityType",
        "attrs": [
          {
            "name": "value"
          }
        ]
      },
      {
        "name": "EntityIdentifier",
        "attrs": [
          {
            "name": "ref"
          },
          {
            "name": "type"
          }
        ]
      },
      {
        "name": "SecondaryIdentifier",
        "attrs": [
          {
            "name": "ref"
          },
          {
            "name": "type"
          }
        ]
      },
      {
        "name": "Identifiers",
        "children": [
          {
            "name": "Identifier",
            "repeatable": true,
            "children": [
              {
                "name": "EntityIdentifier",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ],
                "repeatable": true
              },
              {
                "name": "SecondaryIdentifier",
                "attrs": [
                  {
                    "name": "ref"
                  },
                  {
                    "name": "type"
                  }
                ],
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "DisplayName"
      }
    ]
  },
  "AssertCondition": {
    "name": "AssertCondition",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Condition",
        "doc": "Specifies the condition to evaluate. For more information about writing a conditional statement in Apigee, see Conditions reference."
      }
    ]
  },
  "AssignMessage": {
    "name": "AssignMessage",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "Copy",
        "doc": "Copies values from the message specified by the source attribute to the message specified by the <AssignTo> element.",
        "attrs": [
          {
            "name": "source"
          }
        ],
        "children": [
          {
            "name": "Headers",
            "doc": "Copies HTTP headers from the request or response message specified by the <Copy> element's source attribute to the request or response message specified by the <AssignTo> element.",
            "repeatable": true,
            "children": [
              {
                "name": "Header",
                "values": [
                  "false",
                  "true"
                ],
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Copies query string parameters from the request specified by the <Copy> element's source attribute to the request specified by the <AssignTo> element.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Copies form parameters from the request specified by the <Copy> element's source attribute to the request specified by the <AssignTo> element.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "Payload",
            "doc": "Determines whether the payload should be copied from the source to the destination.",
            "values": [
              "false",
              "true"
            ]
          },
          {
            "name": "Verb",
            "doc": "Determines whether the HTTP verb is copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ]
          },
          {
            "name": "StatusCode",
            "doc": "Determines whether the status code is copied from the source response to the destination response.",
            "values": [
              "false",
              "true"
            ]
          },
          {
            "name": "Path",
            "doc": "Determines whether the path should be copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ]
          },
          {
            "name": "Version",
            "doc": "Determines whether the HTTP version is copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ]
          }
        ]
      },
      {
        "name": "Remove",
        "doc": "Removes headers, query parameters, form parameters, and/or the message payload from a message.",
        "children": [
          {
            "name": "Headers",
            "doc": "Removes the specified HTTP headers from the request or response, which is specified by the <AssignTo> element.",
            "repeatable": true,
            "children": [
              {
                "name": "Header",
                "values": [
                  "false",
                  "true"
                ],
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Removes the specified query parameters from the request.",
            "repeatable": true,
            "children": [
              {
                "name": "QueryParam",
                "values": [
                  "false",
                  "true"
                ],
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Removes the specified form parameters from the request.",
            "repeatable": true,
            "children": [
              {
                "name": "FormParam",
                "values": [
                  "false",
                  "true"
                ],
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "Payload",
            "doc": "Determines whether <Remove> deletes the payload in the request or response, which is specified by the <AssignTo> element."
          },
          {
            "name": "QueryParam",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "Add",
        "doc": "Adds information to the request or response, which is specified by the <AssignTo> element.",
        "children": [
          {
            "name": "Headers",
            "doc": "Adds new headers to the specified request or response, which is specified by the <AssignTo> element.",
            "children": [
              {
                "name": "Header",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Adds new query parameters to the request. This element has no effect on a response.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Adds new form parameters to the request message.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "AssignTo",
            "doc": "Determines which object the AssignMessage policy operates on.",
            "attrs": [
              {
                "name": "createNew",
                "values": [
                  "true",
                  "false"
                ]
              },
              {
                "name": "transport"
              },
              {
                "name": "type",
                "values": [
                  "request",
                  "response"
                ]
              }
            ]
          },
          {
            "name": "FormParam",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "Set",
        "doc": "Sets information in the request or response message, which is specified by the <AssignTo> element.",
        "children": [
          {
            "name": "Headers",
            "doc": "Overwrites existing HTTP headers in the request or response, which is specified by the <AssignTo> element.",
            "children": [
              {
                "name": "Header",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true,
                "children": [
                  {
                    "name": "Header"
                  }
                ]
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Overwrites existing query parameters in the request with new values.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Overwrites existing form parameters on a request and replaces them with the new values that you specify with this element.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "Path",
            "doc": "Sometimes you might need to send a message to a URL other than the URL defined in an API proxy's TargetEndpoint."
          },
          {
            "name": "Payload",
            "doc": "Defines the message body for a request or response, which is specified by the <AssignTo> element.",
            "attrs": [
              {
                "name": "contentType"
              },
              {
                "name": "variablePrefix"
              },
              {
                "name": "variableSuffix"
              }
            ],
            "children": [
              {
                "name": "User-agent"
              },
              {
                "name": "wrapper",
                "children": [
                  {
                    "name": "secret"
                  },
                  {
                    "name": "config",
                    "children": [
                      {
                        "name": "environment"
                      },
                      {
                        "name": "protocol"
                      }
                    ]
                  }
                ]
              },
              {
                "name": "root",
                "children": [
                  {
                    "name": "e1"
                  },
                  {
                    "name": "e2"
                  },
                  {
                    "name": "e3"
                  }
                ]
              },
              {
                "name": "request",
                "children": [
                  {
                    "name": "operation"
                  }
                ]
              }
            ]
          },
          {
            "name": "Authentication",
            "doc": "Generates a Google OAuth 2.0 access token or Google-issued OpenID Connect ID token and sets it into the Authorization header.",
            "children": [
              {
                "name": "HeaderName",
                "doc": "By default, when an Authentication configuration is present, Apigee generates a bearer token and injects it into the Authorization header in the message sent to the target system."
              },
              {
                "name": "GoogleAccessToken",
                "doc": "Generates Google OAuth 2.0 tokens to make authenticated calls to Google services.",
                "children": [
                  {
                    "name": "Scopes",
                    "doc": "Identifies the scopes to be included in the OAuth 2.0 access token.",
                    "children": [
                      {
                        "name": "Scope",
                        "doc": "Specifies a valid Google API scope. For more information, see OAuth 2.0 Scopes for Google APIs."
                      }
                    ]
                  },
                  {
                    "name": "GoogleAccessToken",
                    "doc": "Generates Google OAuth 2.0 tokens to make authenticated calls to Google services.",
                    "children": [
                      {
                        "name": "GoogleIDToken",
                        "doc": "Generates Google-issued OpenID Connect tokens to make authenticated calls to Google services.",
                        "children": [
                          {
                            "name": "Audience",
                            "doc": "The audience for the generated authentication token, such as the API or account that the token grants access to.",
                            "attrs": [
                              {
                                "name": "ref"
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            "name": "StatusCode",
            "doc": "Sets the status code on the response. This element has no effect on a request."
          },
          {
            "name": "Verb",
            "doc": "Sets the HTTP verb on the request. This element has no effect on a response."
          },
          {
            "name": "Version",
            "doc": "Sets the HTTP version on a request. This element has no effect on a response."
          }
        ]
      },
      {
        "name": "AssignVariable",
        "doc": "Assigns a value to a destination flow variable (such as a variable whose value is set by the AssignMessage policy).",
        "repeatable": true,
        "children": [
          {
            "name": "Name",
            "doc": "Specifies the name of the destination flow variable - the variable whose value is set by the AssignMessage policy.",
            "repeatable": true
          },
          {
            "name": "Value",
            "doc": "Defines the value of the destination flow variable set with <AssignVariable>.",
            "repeatable": true
          },
          {
            "name": "Ref",
            "doc": "Specifies the source of the assignment as a flow variable.",
            "repeatable": true
          },
          {
            "name": "PropertySetRef",
            "doc": "This element allows you to retrieve the value of a property set name/key pair dynamically."
          },
          {
            "name": "ResourceURL",
            "doc": "Specifies the URL of a text resource as the source of the variable assignment."
          },
          {
            "name": "Template",
            "doc": "Specifies a message template. A message template allows you to perform variable string substitution when the policy executes, and can combine literal strings with variable names wrapped in curly braces. In addition, message templates…",
            "repeatable": true
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered."
      },
      {
        "name": "AssignTo",
        "doc": "Determines which object the AssignMessage policy operates on.",
        "attrs": [
          {
            "name": "createNew"
          },
          {
            "name": "transport"
          },
          {
            "name": "type"
          }
        ]
      }
    ]
  },
  "BasicAuthentication": {
    "name": "BasicAuthentication",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Operation"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "User",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Password",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "AssignTo",
        "attrs": [
          {
            "name": "createNew"
          }
        ]
      },
      {
        "name": "Source"
      }
    ]
  },
  "CORS": {
    "name": "CORS",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "AllowOrigins",
        "doc": "A list of origins that are allowed to access the resource."
      },
      {
        "name": "AllowMethods",
        "doc": "List of HTTP methods allowed to access the resource."
      },
      {
        "name": "AllowHeaders",
        "doc": "List of HTTP headers that can be used when requesting the resource."
      },
      {
        "name": "ExposeHeaders",
        "doc": "A list of HTTP headers that the browsers are allowed to access or an asterisk (*) to allow all HTTP headers."
      },
      {
        "name": "MaxAge",
        "doc": "Specifies how long the results of a preflight request can be cached in seconds."
      },
      {
        "name": "AllowCredentials",
        "doc": "Indicates whether the caller is allowed to send the actual request (not the preflight) using credentials.",
        "values": [
          "false",
          "true"
        ]
      },
      {
        "name": "GeneratePreflightResponse",
        "doc": "Indicate whether the policy should generate and return the CORS preflight response.",
        "values": [
          "false",
          "true"
        ],
        "repeatable": true
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "false",
          "true"
        ]
      }
    ]
  },
  "DataCapture": {
    "name": "DataCapture",
    "children": [
      {
        "name": "Capture",
        "repeatable": true,
        "children": [
          {
            "name": "DataCollector",
            "repeatable": true,
            "children": [
              {
                "name": "DataCollector",
                "children": [
                  {
                    "name": "Collect",
                    "children": [
                      {
                        "name": "JSONPayload",
                        "doc": "Specifies the JSON-formatted message from which the value of the variable will be extracted.",
                        "children": [
                          {
                            "name": "JSONPath",
                            "doc": "Required child element of the <JSONPayload> element."
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            "name": "Collect",
            "attrs": [
              {
                "name": "ref"
              },
              {
                "name": "default"
              }
            ],
            "repeatable": true,
            "children": [
              {
                "name": "Source",
                "doc": "Specifies a variable naming the message to be parsed."
              },
              {
                "name": "JSONPayload",
                "doc": "Specifies the JSON-formatted message from which the value of the variable will be extracted.",
                "children": [
                  {
                    "name": "JSONPath",
                    "doc": "Required child element of the <JSONPayload> element."
                  }
                ]
              },
              {
                "name": "URIPath",
                "doc": "Extracts a value from the proxy.pathsuffix of a request source message.",
                "children": [
                  {
                    "name": "Pattern",
                    "attrs": [
                      {
                        "name": "ignoreCase"
                      }
                    ],
                    "repeatable": true
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "ThrowExceptionOnLimit"
      }
    ]
  },
  "DecodeJWS": {
    "name": "DecodeJWS",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Source"
      }
    ]
  },
  "DecodeJWT": {
    "name": "DecodeJWT",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Source"
      }
    ]
  },
  "DeleteOAuthV2Info": {
    "name": "DeleteOAuthV2Info",
    "children": [
      {
        "name": "AccessToken",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "AuthorizationCode",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      }
    ]
  },
  "ExternalCallout": {
    "name": "ExternalCallout",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "GrpcConnection",
        "doc": "The <GrpcConnection> element sets the gRPC server to be an existing TargetServer, specified by the name attribute.",
        "children": [
          {
            "name": "Server",
            "attrs": [
              {
                "name": "name"
              }
            ]
          },
          {
            "name": "Authentication",
            "children": [
              {
                "name": "GoogleIDToken",
                "children": [
                  {
                    "name": "Audience",
                    "attrs": [
                      {
                        "name": "useTargetUrl"
                      },
                      {
                        "name": "ref"
                      }
                    ]
                  },
                  {
                    "name": "IncludeEmail",
                    "attrs": [
                      {
                        "name": "ref"
                      }
                    ]
                  }
                ]
              },
              {
                "name": "HeaderName",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "TimeoutMs",
        "doc": "The request timeout in milliseconds for gRPC requests."
      },
      {
        "name": "Configurations",
        "doc": "The <Configurations> element allows you to configure various aspects of the ExternalCallout policy, including <Property> and <FlowVariable>.",
        "children": [
          {
            "name": "Property",
            "doc": "The <Property> element specifies whether request/response headers and/or content will be sent to the server.",
            "attrs": [
              {
                "name": "name"
              }
            ],
            "repeatable": true
          },
          {
            "name": "FlowVariable",
            "doc": "The <FlowVariable> element specifies what additional flow variables will be sent to the server.",
            "repeatable": true
          }
        ]
      },
      {
        "name": "Authentication",
        "children": [
          {
            "name": "HeaderName",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "GoogleIDToken"
          }
        ]
      }
    ]
  },
  "ExtractVariables": {
    "name": "ExtractVariables",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Source",
        "attrs": [
          {
            "name": "clearPayload"
          }
        ]
      },
      {
        "name": "URIPath",
        "children": [
          {
            "name": "Pattern",
            "attrs": [
              {
                "name": "ignoreCase"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "VariablePrefix"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "QueryParam",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "repeatable": true,
        "children": [
          {
            "name": "Pattern",
            "attrs": [
              {
                "name": "ignoreCase"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "Header",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern",
            "attrs": [
              {
                "name": "ignoreCase"
              }
            ]
          }
        ]
      },
      {
        "name": "JSONPayload",
        "children": [
          {
            "name": "Variable",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "type"
              }
            ],
            "repeatable": true,
            "children": [
              {
                "name": "JSONPath",
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "XMLPayload",
        "attrs": [
          {
            "name": "stopPayloadProcessing"
          }
        ],
        "children": [
          {
            "name": "Namespaces",
            "children": [
              {
                "name": "Namespace",
                "attrs": [
                  {
                    "name": "prefix"
                  }
                ]
              }
            ]
          },
          {
            "name": "Variable",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "type"
              }
            ],
            "repeatable": true,
            "children": [
              {
                "name": "XPath",
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "FormParam",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern"
          }
        ]
      },
      {
        "name": "Variable",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern"
          }
        ]
      }
    ]
  },
  "FlowCallout": {
    "name": "FlowCallout",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "SharedFlowBundle"
      },
      {
        "name": "Parameters",
        "children": [
          {
            "name": "Parameter",
            "attrs": [
              {
                "name": "name"
              }
            ],
            "repeatable": true
          }
        ]
      }
    ]
  },
  "GenerateJWS": {
    "name": "GenerateJWS",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Algorithm"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "SecretKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Id"
          }
        ]
      },
      {
        "name": "Payload",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "OutputVariable"
      },
      {
        "name": "AdditionalHeaders",
        "children": [
          {
            "name": "Claim",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "PrivateKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Password",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Id",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "DetachContent"
      }
    ]
  },
  "GenerateJWT": {
    "name": "GenerateJWT",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Type"
      },
      {
        "name": "Algorithm"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "SecretKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Id"
          }
        ]
      },
      {
        "name": "ExpiresIn"
      },
      {
        "name": "Subject"
      },
      {
        "name": "Issuer"
      },
      {
        "name": "Audience"
      },
      {
        "name": "Id"
      },
      {
        "name": "AdditionalClaims",
        "children": [
          {
            "name": "Claim",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "OutputVariable"
      },
      {
        "name": "PrivateKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Password",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Id",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "Algorithms",
        "children": [
          {
            "name": "Key"
          },
          {
            "name": "Content"
          }
        ]
      },
      {
        "name": "PublicKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "AdditionalHeaders",
        "children": [
          {
            "name": "Claim",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      }
    ]
  },
  "GetOAuthV2Info": {
    "name": "GetOAuthV2Info",
    "children": [
      {
        "name": "AccessToken",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "AuthorizationCode",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "RefreshToken",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "ClientId",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      }
    ]
  },
  "GraphQL": {
    "name": "GraphQL",
    "children": [
      {
        "name": "Source",
        "doc": "Source on which this policy executes."
      },
      {
        "name": "OperationType",
        "doc": "Indicates the type of request that can be parsed:",
        "values": [
          "query",
          "mutuation",
          "all"
        ]
      },
      {
        "name": "MaxDepth",
        "doc": "The maximum depth of the query, when represented as a tree."
      },
      {
        "name": "MaxCount",
        "doc": "The maximum number of fragments that can be in the payload."
      },
      {
        "name": "MaxPayloadSizeInBytes",
        "doc": "The maximum size of a payload in kilobytes.",
        "children": [
          {
            "name": "Action",
            "doc": "Action represents one of the following GraphQL actions:"
          },
          {
            "name": "ResourceURL",
            "doc": "The path to the GraphQL schema file that the GraphQL policy verifies requests against."
          }
        ]
      },
      {
        "name": "Action",
        "doc": "Action represents one of the following GraphQL actions:"
      },
      {
        "name": "ResourceURL",
        "doc": "The path to the GraphQL schema file that the GraphQL policy verifies requests against."
      }
    ]
  },
  "HMAC": {
    "name": "HMAC",
    "children": [
      {
        "name": "Algorithm"
      },
      {
        "name": "SecretKey"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "Message"
      },
      {
        "name": "Output"
      },
      {
        "name": "VerificationValue"
      }
    ]
  },
  "HTTPModifier": {
    "name": "HTTPModifier",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "Remove",
        "doc": "Removes headers, query parameters, or form parameters from a message.",
        "children": [
          {
            "name": "Headers",
            "doc": "Removes the specified HTTP headers from the request or response, which is specified by the <AssignTo> element.",
            "children": [
              {
                "name": "Header",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Removes the specified query parameters from the request.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Removes the specified form parameters from the request.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "QueryParam",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "Add",
        "doc": "Adds information to the request or response, which is specified by the <AssignTo> element.",
        "children": [
          {
            "name": "Headers",
            "doc": "Adds new headers to the specified request or response, which is specified by the <AssignTo> element.",
            "children": [
              {
                "name": "Header",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Adds new query parameters to the request. This element has no effect on a response.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Adds new form parameters to the request message.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "AssignTo",
            "doc": "Determines which object the HTTPModifier policy operates on.",
            "attrs": [
              {
                "name": "createNew",
                "values": [
                  "true",
                  "false"
                ]
              },
              {
                "name": "transport"
              },
              {
                "name": "type",
                "values": [
                  "request",
                  "response"
                ]
              }
            ]
          },
          {
            "name": "FormParam",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "Set",
        "doc": "Sets information in the request or response message, which is specified by the <AssignTo> element.",
        "children": [
          {
            "name": "Headers",
            "doc": "Overwrites existing HTTP headers in the request or response, which is specified by the <AssignTo> element.",
            "children": [
              {
                "name": "Header",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "children": [
                  {
                    "name": "Header"
                  }
                ]
              }
            ]
          },
          {
            "name": "QueryParams",
            "doc": "Overwrites existing query parameters in the request with new values.",
            "children": [
              {
                "name": "QueryParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "FormParams",
            "doc": "Overwrites existing form parameters on a request and replaces them with the new values that you specify with this element.",
            "children": [
              {
                "name": "FormParam",
                "attrs": [
                  {
                    "name": "name"
                  }
                ]
              }
            ]
          },
          {
            "name": "Path",
            "doc": "This element isn't currently working as designed to override/rewrite a proxy's target URL."
          },
          {
            "name": "StatusCode",
            "doc": "Sets the status code on the response. This element has no effect on a request.",
            "children": [
              {
                "name": "StatusCode",
                "doc": "Sets the status code on the response. This element has no effect on a request."
              }
            ]
          },
          {
            "name": "Verb",
            "doc": "Sets the HTTP verb on the request. This element has no effect on a response."
          },
          {
            "name": "Version",
            "doc": "Sets the HTTP version on a request. This element has no effect on a response."
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered."
      },
      {
        "name": "AssignTo",
        "doc": "Determines which object the HTTPModifier policy operates on.",
        "attrs": [
          {
            "name": "createNew"
          },
          {
            "name": "transport"
          },
          {
            "name": "type"
          }
        ]
      }
    ]
  },
  "IntegrationCallout": {
    "name": "IntegrationCallout",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "AsyncExecution",
        "doc": "Specifies the mode to run the integration."
      },
      {
        "name": "Request",
        "doc": "Specifies the flow variable having the request object created by the SetIntegrationRequest policy.",
        "attrs": [
          {
            "name": "clearPayload",
            "values": [
              "true",
              "false"
            ]
          }
        ]
      },
      {
        "name": "Response",
        "doc": "Specifies the flow variable for saving the integration's response."
      }
    ]
  },
  "InvalidateCache": {
    "name": "InvalidateCache",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "CacheKey",
        "children": [
          {
            "name": "Prefix"
          },
          {
            "name": "KeyFragment",
            "attrs": [
              {
                "name": "ref"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "CacheResource"
      },
      {
        "name": "Scope"
      },
      {
        "name": "CacheContext",
        "children": [
          {
            "name": "APIProxyName"
          },
          {
            "name": "ProxyName"
          },
          {
            "name": "TargetName"
          }
        ]
      },
      {
        "name": "PurgeChildEntries"
      }
    ]
  },
  "JavaCallout": {
    "name": "JavaCallout",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "ClassName"
      },
      {
        "name": "ResourceURL"
      },
      {
        "name": "Properties",
        "children": [
          {
            "name": "Property",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      }
    ]
  },
  "Javascript": {
    "name": "Javascript",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Properties",
        "children": [
          {
            "name": "Property",
            "attrs": [
              {
                "name": "name"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "ResourceURL"
      },
      {
        "name": "SSLInfo",
        "children": [
          {
            "name": "Enabled"
          },
          {
            "name": "ClientAuthEnabled"
          },
          {
            "name": "KeyStore"
          },
          {
            "name": "KeyAlias"
          },
          {
            "name": "TrustStore"
          }
        ]
      },
      {
        "name": "IncludeURL"
      },
      {
        "name": "Source"
      }
    ]
  },
  "JSONThreatProtection": {
    "name": "JSONThreatProtection",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "ArrayElementCount"
      },
      {
        "name": "ContainerDepth"
      },
      {
        "name": "ObjectEntryCount"
      },
      {
        "name": "ObjectEntryNameLength"
      },
      {
        "name": "Source"
      },
      {
        "name": "StringValueLength"
      }
    ]
  },
  "JSONToXML": {
    "name": "JSONToXML",
    "children": [
      {
        "name": "Source"
      },
      {
        "name": "OutputVariable"
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "Options",
        "children": [
          {
            "name": "OmitXmlDeclaration"
          },
          {
            "name": "DefaultNamespaceNodeName"
          },
          {
            "name": "NamespaceSeparator"
          },
          {
            "name": "AttributeBlockName"
          },
          {
            "name": "AttributePrefix"
          },
          {
            "name": "ObjectRootElementName"
          },
          {
            "name": "ArrayRootElementName"
          },
          {
            "name": "ArrayItemElementName"
          },
          {
            "name": "Indent"
          },
          {
            "name": "TextNodeName"
          },
          {
            "name": "NullValue"
          },
          {
            "name": "InvalidCharsReplacement"
          }
        ]
      }
    ]
  },
  "KeyValueMapOperations": {
    "name": "KeyValueMapOperations",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "ExpiryTimeInSecs"
      },
      {
        "name": "Scope"
      },
      {
        "name": "Put",
        "attrs": [
          {
            "name": "override"
          }
        ],
        "children": [
          {
            "name": "Key",
            "children": [
              {
                "name": "Parameter",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          },
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "Get",
        "attrs": [
          {
            "name": "assignTo"
          },
          {
            "name": "index"
          }
        ],
        "children": [
          {
            "name": "Key",
            "children": [
              {
                "name": "Parameter",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "MapName",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "InitialEntries",
        "children": [
          {
            "name": "Entry",
            "repeatable": true,
            "children": [
              {
                "name": "Key",
                "repeatable": true,
                "children": [
                  {
                    "name": "Parameter",
                    "repeatable": true
                  }
                ]
              },
              {
                "name": "Value",
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "Delete",
        "children": [
          {
            "name": "Key",
            "children": [
              {
                "name": "Parameter"
              }
            ]
          }
        ]
      }
    ]
  },
  "LLMTokenQuota": {
    "name": "LLMTokenQuota",
    "children": [
      {
        "name": "Interval",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "TimeUnit",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Allow",
        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
        "attrs": [
          {
            "name": "count"
          },
          {
            "name": "countRef"
          }
        ],
        "repeatable": true,
        "children": [
          {
            "name": "Class",
            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
            "attrs": [
              {
                "name": "ref"
              }
            ],
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                "attrs": [
                  {
                    "name": "class"
                  },
                  {
                    "name": "count"
                  }
                ],
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "Identifier",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "StartTime"
      },
      {
        "name": "SharedName"
      },
      {
        "name": "EnforceOnly"
      },
      {
        "name": "Distributed"
      },
      {
        "name": "CountOnly"
      },
      {
        "name": "LLMTokenUsageSource"
      },
      {
        "name": "LLMModelSource"
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "Synchronous"
      },
      {
        "name": "AsynchronousConfiguration",
        "children": [
          {
            "name": "SyncIntervalInSeconds",
            "doc": "Overrides the default behavior in which asynchronous updates are performed after an interval of 10 seconds."
          },
          {
            "name": "SyncMessageCount",
            "doc": "Specifies the number of requests to process before synchronizing the quota counter."
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "UseQuotaConfigInAPIProduct",
        "children": [
          {
            "name": "DefaultConfig",
            "doc": "Contains default values for an API product's quota.",
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                "children": [
                  {
                    "name": "Class",
                    "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                    "attrs": [
                      {
                        "name": "ref"
                      }
                    ],
                    "children": [
                      {
                        "name": "Allow",
                        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                        "attrs": [
                          {
                            "name": "class"
                          },
                          {
                            "name": "count"
                          }
                        ],
                        "repeatable": true
                      }
                    ]
                  }
                ]
              },
              {
                "name": "Interval",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              },
              {
                "name": "TimeUnit",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "LookupCache": {
    "name": "LookupCache",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "CacheKey",
        "children": [
          {
            "name": "Prefix"
          },
          {
            "name": "KeyFragment",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "CacheResource"
      },
      {
        "name": "CacheLookupTimeoutInSeconds"
      },
      {
        "name": "Scope"
      },
      {
        "name": "AssignTo"
      }
    ]
  },
  "MessageLogging": {
    "name": "MessageLogging",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Syslog",
        "doc": "Use the <Syslog> element to configure messages to be logged to syslog.",
        "children": [
          {
            "name": "Message"
          },
          {
            "name": "Host"
          },
          {
            "name": "Port"
          },
          {
            "name": "Protocol"
          },
          {
            "name": "FormatMessage"
          },
          {
            "name": "DateFormat"
          },
          {
            "name": "SSLInfo",
            "children": [
              {
                "name": "Enabled"
              }
            ]
          }
        ]
      },
      {
        "name": "CloudLogging",
        "doc": "Use the <CloudLogging> element to log messages to Cloud Logging.",
        "children": [
          {
            "name": "LogName"
          },
          {
            "name": "Message",
            "attrs": [
              {
                "name": "contentType"
              }
            ]
          },
          {
            "name": "Labels",
            "children": [
              {
                "name": "Label",
                "repeatable": true,
                "children": [
                  {
                    "name": "Key",
                    "repeatable": true
                  },
                  {
                    "name": "Value",
                    "repeatable": true
                  }
                ]
              }
            ]
          },
          {
            "name": "ResourceType"
          },
          {
            "name": "Endpoint"
          }
        ]
      },
      {
        "name": "logLevel",
        "doc": "Valid values for the <logLevel> element are: INFO (default), ALERT, WARN, ERROR."
      }
    ]
  },
  "MessageValidation": {
    "name": "MessageValidation",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Element",
        "doc": "Specifies the element in the message to validate.",
        "attrs": [
          {
            "name": "namespace"
          }
        ]
      },
      {
        "name": "SOAPMessage",
        "doc": "Defines the SOAP version against which the MessageValidation policy validates.",
        "attrs": [
          {
            "name": "version"
          }
        ]
      },
      {
        "name": "Source",
        "doc": "Identifies the source message to be validated."
      },
      {
        "name": "ResourceURL",
        "doc": "Identifies the XSD schema or WSDL definition to be used to validate the source message."
      },
      {
        "name": "Properties"
      }
    ]
  },
  "MonetizationLimitsCheck": {
    "name": "MonetizationLimitsCheck",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "FaultResponse",
        "doc": "Defines the response message returned to the requesting client.",
        "children": [
          {
            "name": "AssignVariable",
            "doc": "Assigns a value to a destination flow variable.",
            "children": [
              {
                "name": "Name"
              },
              {
                "name": "Value"
              }
            ]
          },
          {
            "name": "Add",
            "doc": "Adds HTTP headers to the error message.",
            "children": [
              {
                "name": "Headers"
              }
            ]
          },
          {
            "name": "Copy",
            "doc": "Copies information from the message specified by the source attribute to the error message.",
            "attrs": [
              {
                "name": "source"
              }
            ],
            "children": [
              {
                "name": "Headers"
              },
              {
                "name": "StatusCode"
              }
            ]
          },
          {
            "name": "Remove",
            "doc": "Removes specified HTTP headers from the error message.",
            "children": [
              {
                "name": "Headers"
              }
            ]
          },
          {
            "name": "Set",
            "doc": "Sets information in the error message.",
            "children": [
              {
                "name": "Headers"
              },
              {
                "name": "Payload",
                "attrs": [
                  {
                    "name": "contentType"
                  }
                ],
                "children": [
                  {
                    "name": "error",
                    "children": [
                      {
                        "name": "messages",
                        "children": [
                          {
                            "name": "message"
                          }
                        ]
                      }
                    ]
                  }
                ]
              },
              {
                "name": "StatusCode"
              }
            ]
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered."
      }
    ]
  },
  "OASValidation": {
    "name": "OASValidation",
    "children": [
      {
        "name": "OASResource",
        "doc": "Specifies the OpenAPI Specification to validate against."
      },
      {
        "name": "Options",
        "doc": "Configures options for the policy.",
        "children": [
          {
            "name": "ValidateMessageBody",
            "doc": "Specifies whether the policy should validate the message body against the operation's request body schema in the OpenAPI Specification."
          },
          {
            "name": "AllowUnspecifiedParameters",
            "children": [
              {
                "name": "Header"
              },
              {
                "name": "Query"
              },
              {
                "name": "Cookie"
              }
            ]
          }
        ]
      },
      {
        "name": "Source",
        "doc": "JSON message to be evaluated against JSON payload attacks."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Properties"
      }
    ]
  },
  "OAuthV2": {
    "name": "OAuthV2",
    "children": [
      {
        "name": "Operation"
      },
      {
        "name": "AppEndUser"
      },
      {
        "name": "UserName"
      },
      {
        "name": "PassWord"
      },
      {
        "name": "GrantType"
      },
      {
        "name": "ClientId"
      },
      {
        "name": "SupportedGrantTypes",
        "children": [
          {
            "name": "GrantType"
          }
        ]
      },
      {
        "name": "ExpiresIn"
      },
      {
        "name": "GenerateResponse"
      },
      {
        "name": "AccessToken"
      },
      {
        "name": "AccessTokenPrefix"
      },
      {
        "name": "Scope"
      }
    ]
  },
  "ParsePayload": {
    "name": "ParsePayload",
    "children": [
      {
        "name": "Source"
      },
      {
        "name": "PayloadType"
      },
      {
        "name": "Protocol"
      }
    ]
  },
  "PopulateCache": {
    "name": "PopulateCache",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Properties"
      },
      {
        "name": "CacheKey",
        "children": [
          {
            "name": "Prefix"
          },
          {
            "name": "KeyFragment",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "CacheResource"
      },
      {
        "name": "Scope"
      },
      {
        "name": "ExpirySettings",
        "children": [
          {
            "name": "TimeoutInSeconds"
          }
        ]
      },
      {
        "name": "Source"
      }
    ]
  },
  "PromptTokenLimit": {
    "name": "PromptTokenLimit",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "UserPromptSource",
        "doc": "Provides the source for retrieving user prompt text."
      },
      {
        "name": "Identifier",
        "doc": "Lets you choose how to group the requests so that the PromptTokenLimit policy can be applied based on the client.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Rate",
        "doc": "Specifies the rate at which to limit token spikes (or bursts) by setting the number of tokens that are allowed in per minute or per second intervals.",
        "values": [
          "pm",
          "ps"
        ],
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "UseEffectiveCount",
        "doc": "This element lets you choose between distinct PromptTokenLimit algorithms by setting the value to true or false, as explained below:",
        "values": [
          "false",
          "true"
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "false",
          "true"
        ]
      }
    ]
  },
  "PublishMessage": {
    "name": "PublishMessage",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Source",
        "doc": "Specifies the message to publish."
      },
      {
        "name": "Attributes",
        "doc": "Specifies the attributes to attach to the Pub/Sub message.",
        "children": [
          {
            "name": "Attribute",
            "repeatable": true
          }
        ]
      },
      {
        "name": "CloudPubSub",
        "doc": "Parent element of <Topic>.",
        "children": [
          {
            "name": "Topic",
            "doc": "Specifies the Pub/Sub topic to which you want to publish the <Source> message."
          },
          {
            "name": "Endpoint",
            "doc": "The <Endpoint> element uses the following syntax:"
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Specifies whether processing stops if Apigee encounters an unresolved variable.",
        "values": [
          "true",
          "false"
        ]
      },
      {
        "name": "UseMessageAsSource",
        "doc": "Specifies the message to publish."
      }
    ]
  },
  "Quota": {
    "name": "Quota",
    "children": [
      {
        "name": "Interval",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "TimeUnit",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Allow",
        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
        "attrs": [
          {
            "name": "count"
          },
          {
            "name": "countRef"
          }
        ],
        "children": [
          {
            "name": "Class",
            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
            "attrs": [
              {
                "name": "ref"
              }
            ],
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                "attrs": [
                  {
                    "name": "class"
                  },
                  {
                    "name": "count"
                  }
                ],
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "Identifier",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "StartTime"
      },
      {
        "name": "SharedName"
      },
      {
        "name": "EnforceOnly"
      },
      {
        "name": "Distributed"
      },
      {
        "name": "CountOnly"
      },
      {
        "name": "MessageWeight",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      }
    ]
  },
  "RaiseFault": {
    "name": "RaiseFault",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "FaultResponse",
        "children": [
          {
            "name": "Set",
            "children": [
              {
                "name": "StatusCode"
              },
              {
                "name": "Payload",
                "attrs": [
                  {
                    "name": "contentType"
                  }
                ],
                "children": [
                  {
                    "name": "root"
                  }
                ]
              },
              {
                "name": "Headers"
              }
            ]
          },
          {
            "name": "Add",
            "children": [
              {
                "name": "Headers",
                "children": [
                  {
                    "name": "Header",
                    "attrs": [
                      {
                        "name": "name"
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            "name": "AssignVariable",
            "children": [
              {
                "name": "Name"
              },
              {
                "name": "Value"
              }
            ]
          },
          {
            "name": "Copy",
            "attrs": [
              {
                "name": "source"
              }
            ],
            "children": [
              {
                "name": "Headers"
              },
              {
                "name": "StatusCode"
              }
            ]
          },
          {
            "name": "Remove",
            "children": [
              {
                "name": "Headers"
              }
            ]
          }
        ]
      },
      {
        "name": "DisplayName"
      }
    ]
  },
  "ReadPropertySet": {
    "name": "ReadPropertySet",
    "children": [
      {
        "name": "Read",
        "doc": "Resolves a property set variable and sets the result in a flow variable.",
        "children": [
          {
            "name": "Name",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Key",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "AssignTo"
          },
          {
            "name": "DefaultValue"
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a property set is unresolved."
      }
    ]
  },
  "RegularExpressionProtection": {
    "name": "RegularExpressionProtection",
    "children": [
      {
        "name": "Source"
      },
      {
        "name": "JSONPayload",
        "attrs": [
          {
            "name": "escapeSlashCharacter"
          }
        ],
        "children": [
          {
            "name": "JSONPath",
            "children": [
              {
                "name": "Expression"
              },
              {
                "name": "Pattern",
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "FormParam",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "repeatable": true,
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "URIPath",
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "QueryParam",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "Header",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "Variable",
        "attrs": [
          {
            "name": "name"
          }
        ],
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "XMLPayload",
        "children": [
          {
            "name": "Namespaces",
            "children": [
              {
                "name": "Namespace",
                "attrs": [
                  {
                    "name": "prefix"
                  }
                ]
              }
            ]
          },
          {
            "name": "XPath",
            "children": [
              {
                "name": "Expression"
              },
              {
                "name": "Type"
              },
              {
                "name": "Pattern",
                "repeatable": true
              }
            ]
          }
        ]
      }
    ]
  },
  "ResetQuota": {
    "name": "ResetQuota",
    "children": [
      {
        "name": "Quota",
        "attrs": [
          {
            "name": "name"
          },
          {
            "name": "ref"
          }
        ],
        "children": [
          {
            "name": "Identifier",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "ref"
              }
            ],
            "children": [
              {
                "name": "Allow",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              },
              {
                "name": "Class",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "DisplayName"
      }
    ]
  },
  "ResponseCache": {
    "name": "ResponseCache",
    "children": [
      {
        "name": "CacheKey",
        "children": [
          {
            "name": "KeyFragment",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Prefix"
          }
        ]
      },
      {
        "name": "ExpirySettings",
        "children": [
          {
            "name": "TimeoutInSeconds",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "ExpiryDate"
          },
          {
            "name": "TimeOfDay"
          }
        ]
      },
      {
        "name": "SkipCacheLookup"
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "Properties"
      },
      {
        "name": "Scope"
      },
      {
        "name": "CacheResource"
      },
      {
        "name": "CacheLookupTimeoutInSeconds"
      },
      {
        "name": "ExcludeErrorResponse"
      },
      {
        "name": "SkipCachePopulation"
      },
      {
        "name": "UseAcceptHeader"
      },
      {
        "name": "UseResponseCacheHeaders"
      }
    ]
  },
  "SanitizeModelResponse": {
    "name": "SanitizeModelResponse",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "ModelArmor",
        "children": [
          {
            "name": "TemplateName",
            "doc": "The Model Armor template."
          }
        ]
      },
      {
        "name": "UserPromptSource"
      },
      {
        "name": "LLMResponseSource"
      },
      {
        "name": "FunctionCallSource",
        "doc": "The location of the function call arguments to extract from the model response."
      }
    ]
  },
  "SanitizeUserPrompt": {
    "name": "SanitizeUserPrompt",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "ModelArmor",
        "doc": "Contains the required information for specifying the Model Armor template.",
        "children": [
          {
            "name": "TemplateName"
          }
        ]
      },
      {
        "name": "UserPromptSource"
      },
      {
        "name": "FunctionResponseSource",
        "doc": "The location of the function or tool response data to extract from the request."
      }
    ]
  },
  "SemanticCacheLookup": {
    "name": "SemanticCacheLookup",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved."
      },
      {
        "name": "UserPromptSource"
      },
      {
        "name": "Embeddings",
        "doc": "This element contains the information required to generate text embeddings.",
        "children": [
          {
            "name": "VertexAI",
            "doc": "Contains the <URL> element for Vertex AI-specific attributes.",
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to generate text embeddings. See Supported models for a list of models that provide text embeddings for the SemanticCacheLookup policy."
              }
            ]
          }
        ]
      },
      {
        "name": "SimilaritySearch",
        "doc": "This element contains the information required to perform similarity searches.",
        "children": [
          {
            "name": "VertexAI",
            "doc": "Contains the <URL> element for Vertex AI-specific attributes.",
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to generate text embeddings. See Supported models for a list of models that provide text embeddings for the SemanticCacheLookup policy."
              },
              {
                "name": "DeployedIndexID"
              },
              {
                "name": "Threshold"
              }
            ]
          }
        ]
      }
    ]
  },
  "SemanticCachePopulate": {
    "name": "SemanticCachePopulate",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved."
      },
      {
        "name": "SimilaritySearch",
        "doc": "Element containing the information required to update the vector index.",
        "children": [
          {
            "name": "VertexAI",
            "doc": "Contains the <URL> element for Vertex AI-specific attributes.",
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to upsert datapoints in the vector index."
              }
            ]
          }
        ]
      },
      {
        "name": "TTLInSeconds",
        "doc": "Element specifying the time to live (TTL) for the cached responses, in seconds."
      }
    ]
  },
  "ServiceCallout": {
    "name": "ServiceCallout",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Request",
        "attrs": [
          {
            "name": "variable"
          },
          {
            "name": "clearPayload"
          }
        ],
        "children": [
          {
            "name": "Set",
            "children": [
              {
                "name": "QueryParams",
                "children": [
                  {
                    "name": "QueryParam",
                    "attrs": [
                      {
                        "name": "name"
                      }
                    ],
                    "repeatable": true
                  }
                ]
              },
              {
                "name": "Headers"
              },
              {
                "name": "FormParams"
              },
              {
                "name": "Payload"
              },
              {
                "name": "StatusCode"
              },
              {
                "name": "Path"
              },
              {
                "name": "Version"
              },
              {
                "name": "Verb"
              }
            ]
          },
          {
            "name": "IgnoreUnresolvedVariables"
          },
          {
            "name": "Remove",
            "children": [
              {
                "name": "StatusCode"
              },
              {
                "name": "Path"
              },
              {
                "name": "Version"
              },
              {
                "name": "Verb"
              }
            ]
          },
          {
            "name": "Copy",
            "children": [
              {
                "name": "StatusCode"
              },
              {
                "name": "Path"
              },
              {
                "name": "Version"
              },
              {
                "name": "Verb"
              }
            ]
          },
          {
            "name": "Add",
            "children": [
              {
                "name": "Headers"
              },
              {
                "name": "QueryParams"
              },
              {
                "name": "FormParams"
              }
            ]
          }
        ]
      },
      {
        "name": "Response"
      },
      {
        "name": "Timeout"
      },
      {
        "name": "HTTPTargetConnection",
        "children": [
          {
            "name": "URL"
          },
          {
            "name": "LoadBalancer",
            "children": [
              {
                "name": "Algorithm"
              },
              {
                "name": "Server",
                "attrs": [
                  {
                    "name": "name"
                  }
                ],
                "repeatable": true
              }
            ]
          },
          {
            "name": "Path"
          },
          {
            "name": "SSLInfo"
          },
          {
            "name": "Properties"
          },
          {
            "name": "Authentication",
            "repeatable": true,
            "children": [
              {
                "name": "HeaderName",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ],
                "repeatable": true
              },
              {
                "name": "GoogleAccessToken",
                "children": [
                  {
                    "name": "Scopes",
                    "children": [
                      {
                        "name": "Scope"
                      }
                    ]
                  },
                  {
                    "name": "LifetimeInSeconds",
                    "attrs": [
                      {
                        "name": "ref"
                      }
                    ]
                  }
                ]
              },
              {
                "name": "GoogleIDToken",
                "children": [
                  {
                    "name": "Audience",
                    "attrs": [
                      {
                        "name": "ref"
                      },
                      {
                        "name": "useTargetUrl"
                      }
                    ]
                  },
                  {
                    "name": "IncludeEmail",
                    "attrs": [
                      {
                        "name": "ref"
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "Properties"
      },
      {
        "name": "LocalTargetConnection",
        "children": [
          {
            "name": "APIProxy"
          },
          {
            "name": "ProxyEndpoint"
          },
          {
            "name": "Path"
          }
        ]
      },
      {
        "name": "Authentication",
        "children": [
          {
            "name": "HeaderName",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "GoogleAccessToken",
            "children": [
              {
                "name": "Scopes",
                "children": [
                  {
                    "name": "Scope"
                  }
                ]
              },
              {
                "name": "LifetimeInSeconds",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          },
          {
            "name": "GoogleIDToken",
            "children": [
              {
                "name": "Audience",
                "attrs": [
                  {
                    "name": "ref"
                  },
                  {
                    "name": "useTargetUrl"
                  }
                ]
              },
              {
                "name": "IncludeEmail",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  "SetIntegrationRequest": {
    "name": "SetIntegrationRequest",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "ProjectId",
        "doc": "Specifies the name of the Google Cloud Project.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "IntegrationName",
        "doc": "Specifies the integration to run.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "IntegrationRegion",
        "doc": "Specifies the region where integration exists.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "ApiTrigger",
        "doc": "Specifies the API trigger to run.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "ScheduleTime",
        "doc": "Specifies the time at which the integration must run."
      },
      {
        "name": "Parameters",
        "doc": "Specifies the input parameters required to run the integration.",
        "children": [
          {
            "name": "Parameter",
            "doc": "Specifies an input parameter.",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "type"
              },
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "ParameterArray",
            "doc": "Specifies an input parameter array.",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "type"
              },
              {
                "name": "ref"
              }
            ],
            "children": [
              {
                "name": "Value",
                "attrs": [
                  {
                    "name": "ref"
                  }
                ],
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "Request",
        "doc": "Specifies the flow variable name for saving the request."
      }
    ]
  },
  "SetOAuthV2Info": {
    "name": "SetOAuthV2Info",
    "children": [
      {
        "name": "AccessToken",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Attributes",
        "children": [
          {
            "name": "Attribute",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "ref"
              }
            ]
          }
        ]
      }
    ]
  },
  "SpikeArrest": {
    "name": "SpikeArrest",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "Identifier",
        "doc": "Lets you choose how to group the requests so that the SpikeArrest policy can be applied based on the client.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "MessageWeight",
        "doc": "Specifies the weighting defined for each message.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Rate",
        "doc": "Specifies the rate at which to limit traffic spikes (or bursts) by setting the number of requests that are allowed in per minute or per second intervals.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "UseEffectiveCount",
        "doc": "This element lets you choose between distinct spike arrest algorithms by setting the value to true or false, as explained below:",
        "values": [
          "false",
          "true"
        ]
      }
    ]
  },
  "TraceCapture": {
    "name": "TraceCapture",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Variables",
        "doc": "Specifies the list of variables to trace.",
        "children": [
          {
            "name": "Variable",
            "doc": "Specifies the variables to be added in the trace data.",
            "attrs": [
              {
                "name": "name"
              },
              {
                "name": "ref"
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered."
      },
      {
        "name": "ThrowExceptionOnLimit",
        "doc": "Specifies the behavior of the policy when the size of the variable exceeds the limit of 256 bytes."
      }
    ]
  },
  "VerifyAPIKey": {
    "name": "VerifyAPIKey",
    "children": [
      {
        "name": "APIKey",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "CacheExpiryInSeconds",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      }
    ]
  },
  "VerifyIAM": {
    "name": "VerifyIAM",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "CredentialSource"
      }
    ]
  },
  "VerifyJWS": {
    "name": "VerifyJWS",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Algorithm"
      },
      {
        "name": "Source"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "SecretKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "PublicKey",
        "children": [
          {
            "name": "Value",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "DetachedContent"
      }
    ]
  },
  "VerifyJWT": {
    "name": "VerifyJWT",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "Algorithm"
      },
      {
        "name": "Source"
      },
      {
        "name": "IgnoreUnresolvedVariables"
      },
      {
        "name": "SecretKey",
        "attrs": [
          {
            "name": "encoding"
          }
        ],
        "children": [
          {
            "name": "Value",
            "doc": "<PrivateKey> <Value ref=\"private.variable-name-here\"/> </PrivateKey> Child of the <PrivateKey> element.",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "Subject"
      },
      {
        "name": "Issuer"
      },
      {
        "name": "Audience"
      },
      {
        "name": "AdditionalClaims",
        "children": [
          {
            "name": "Claim",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "PublicKey",
        "children": [
          {
            "name": "Value",
            "doc": "<PrivateKey> <Value ref=\"private.variable-name-here\"/> </PrivateKey> Child of the <PrivateKey> element.",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "Algorithms",
        "children": [
          {
            "name": "Key"
          },
          {
            "name": "Content"
          }
        ]
      },
      {
        "name": "Type"
      },
      {
        "name": "PrivateKey",
        "children": [
          {
            "name": "Value",
            "doc": "<PrivateKey> <Value ref=\"private.variable-name-here\"/> </PrivateKey> Child of the <PrivateKey> element.",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          }
        ]
      },
      {
        "name": "AdditionalHeaders",
        "children": [
          {
            "name": "Claim",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "TimeAllowance"
      },
      {
        "name": "RequiredClaims",
        "repeatable": true
      }
    ]
  },
  "XMLThreatProtection": {
    "name": "XMLThreatProtection",
    "children": [
      {
        "name": "DisplayName"
      },
      {
        "name": "NameLimits",
        "children": [
          {
            "name": "Element"
          },
          {
            "name": "Attribute"
          },
          {
            "name": "NamespacePrefix"
          },
          {
            "name": "ProcessingInstructionTarget"
          }
        ]
      },
      {
        "name": "Source"
      },
      {
        "name": "StructureLimits",
        "children": [
          {
            "name": "NodeDepth"
          },
          {
            "name": "AttributeCountPerElement"
          },
          {
            "name": "NamespaceCountPerElement"
          },
          {
            "name": "ChildCount",
            "attrs": [
              {
                "name": "includeComment"
              },
              {
                "name": "includeElement"
              },
              {
                "name": "includeProcessingInstruction"
              },
              {
                "name": "includeText"
              }
            ]
          }
        ]
      },
      {
        "name": "ValueLimits",
        "children": [
          {
            "name": "Text"
          },
          {
            "name": "Attribute"
          },
          {
            "name": "NamespaceURI"
          },
          {
            "name": "Comment"
          },
          {
            "name": "ProcessingInstructionData"
          }
        ]
      }
    ]
  },
  "XMLToJSON": {
    "name": "XMLToJSON",
    "children": [
      {
        "name": "Options",
        "children": [
          {
            "name": "RecognizeNumber"
          },
          {
            "name": "RecognizeBoolean"
          },
          {
            "name": "RecognizeNull"
          },
          {
            "name": "NullValue"
          },
          {
            "name": "NamespaceBlockName"
          },
          {
            "name": "DefaultNamespaceNodeName"
          },
          {
            "name": "NamespaceSeparator"
          },
          {
            "name": "TextAlwaysAsProperty"
          },
          {
            "name": "TextNodeName"
          },
          {
            "name": "AttributeBlockName"
          },
          {
            "name": "AttributePrefix"
          },
          {
            "name": "OutputPrefix"
          },
          {
            "name": "OutputSuffix"
          },
          {
            "name": "StripLevels"
          },
          {
            "name": "TreatAsArray",
            "children": [
              {
                "name": "Path",
                "attrs": [
                  {
                    "name": "unwrap"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "OutputVariable"
      },
      {
        "name": "Source"
      },
      {
        "name": "DisplayName"
      },
      {
        "name": "Format"
      }
    ]
  },
  "XSL": {
    "name": "XSL",
    "children": [
      {
        "name": "ResourceURL",
        "doc": "The XSL file that Apigee uses for transforming the message."
      },
      {
        "name": "Source",
        "doc": "Specifies the message that is transformed."
      }
    ]
  }
};

/** Documentation page slug per policy tag, taken from the reference index. */
export const GENERATED_DOC_SLUGS: Record<string, string> = {
  "AccessControl": "access-control-policy",
  "AccessEntity": "access-entity-policy",
  "AssertCondition": "assert-condition-policy",
  "AssignMessage": "assign-message-policy",
  "BasicAuthentication": "basic-authentication-policy",
  "CORS": "cors-policy",
  "DataCapture": "data-capture-policy",
  "DecodeJWS": "decode-jws-policy",
  "DecodeJWT": "decode-jwt-policy",
  "DeleteOAuthV2Info": "delete-oauth-v2-info",
  "ExternalCallout": "external-callout-policy",
  "ExtractVariables": "extract-variables-policy",
  "FlowCallout": "flow-callout-policy",
  "GenerateJWS": "generate-jws-policy",
  "GenerateJWT": "generate-jwt-policy",
  "GetOAuthV2Info": "get-oauth-v2-info-policy",
  "GraphQL": "graphql-policy",
  "HMAC": "hmac-policy",
  "HTTPModifier": "http-modifier-policy",
  "IntegrationCallout": "integration-callout-policy",
  "InvalidateCache": "invalidate-cache-policy",
  "JavaCallout": "java-callout-policy",
  "Javascript": "javascript-policy",
  "JSONThreatProtection": "json-threat-protection-policy",
  "JSONToXML": "json-xml-policy",
  "KeyValueMapOperations": "key-value-map-operations-policy",
  "LLMTokenQuota": "llm-token-quota-policy",
  "LookupCache": "lookup-cache-policy",
  "MessageLogging": "message-logging-policy",
  "MessageValidation": "message-validation-policy",
  "MonetizationLimitsCheck": "monetization-limits-check-policy",
  "OASValidation": "oas-validation-policy",
  "OAuthV2": "oauthv2-policy",
  "ParsePayload": "parse-payload-policy",
  "PopulateCache": "populate-cache-policy",
  "PromptTokenLimit": "prompt-token-limit-policy",
  "PublishMessage": "publish-message-policy",
  "Quota": "quota-policy",
  "RaiseFault": "raise-fault-policy",
  "ReadPropertySet": "read-property-set-policy",
  "RegularExpressionProtection": "regular-expression-protection",
  "ResetQuota": "reset-quota-policy",
  "ResponseCache": "response-cache-policy",
  "SanitizeModelResponse": "sanitize-llm-response-policy",
  "SanitizeUserPrompt": "sanitize-user-prompt-policy",
  "SemanticCacheLookup": "semantic-cache-lookup-policy",
  "SemanticCachePopulate": "semantic-cache-populate-policy",
  "ServiceCallout": "service-callout-policy",
  "SetIntegrationRequest": "set-integration-request-policy",
  "SetOAuthV2Info": "set-oauth-v2-info-policy",
  "SpikeArrest": "spike-arrest-policy",
  "TraceCapture": "trace-capture-policy",
  "VerifyAPIKey": "verify-api-key-policy",
  "VerifyIAM": "verify-iam-policy",
  "VerifyJWS": "verify-jws-policy",
  "VerifyJWT": "verify-jwt-policy",
  "XMLThreatProtection": "xml-threat-protection-policy",
  "XMLToJSON": "xml-json-policy",
  "XSL": "xsl-transform-policy"
};
