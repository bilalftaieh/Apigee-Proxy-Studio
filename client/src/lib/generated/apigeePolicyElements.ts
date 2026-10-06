// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Produced by scripts/generate-policy-schemas.mjs from the Apigee X policy
// reference at https://docs.cloud.google.com/apigee/docs/api-platform/reference/policies.
// Re-run `npm run generate:policy-schemas` to refresh.
//
// Generated 2026-10-01.
//
// That date is the only way to tell how far this has drifted from the
// reference, because the page cache it was built from is not in git.
// `npm run check:policy-schemas` says whether the reference has moved since.
//
// 60 of 60 policy root tags, 855 elements, 587 with documentation.
// 84 enumerated, 109 required, 87 with a default.

import type { XmlElementDef } from '../policyXmlSchema';

export const GENERATED_POLICY_ELEMENTS: Record<string, XmlElementDef> = {
  "AccessControl": {
    "name": "AccessControl",
    "children": [
      {
        "name": "IPRules",
        "doc": "The parent element containing the rules that allow or deny IP addresses.",
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
        "name": "ValidateBasedOn",
        "doc": "When the X-Forwarded-For HTTP header contains multiple IP addresses, use this ValidateBasedOn element to control which IP addresses are evaluated.",
        "default": "X_FORWARDED_FOR_ALL_IP"
      },
      {
        "name": "ClientIPVariable",
        "doc": "Specifies a flow variable containing an IP address that the policy checks against the IPRules."
      },
      {
        "name": "IgnoreTrueClientIPHeader"
      }
    ]
  },
  "AccessEntity": {
    "name": "AccessEntity",
    "children": [
      {
        "name": "EntityType",
        "doc": "Specifies the type of entity to retrieve from the data store.",
        "required": true,
        "attrs": [
          {
            "name": "value"
          }
        ]
      },
      {
        "name": "EntityIdentifier",
        "doc": "Specifies the particular entity -- of the type given in EntityType -- to get.",
        "required": true,
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
        "doc": "In conjunction with EntityIdentifier, specifies a value to identify the desired instance of the given EntityType.",
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
                "doc": "Specifies the particular entity -- of the type given in EntityType -- to get.",
                "required": true,
                "attrs": [
                  {
                    "name": "ref"
                  }
                ],
                "repeatable": true
              },
              {
                "name": "SecondaryIdentifier",
                "doc": "In conjunction with EntityIdentifier, specifies a value to identify the desired instance of the given EntityType.",
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "OutputFormat",
        "doc": "Specifies which format the AccessEntity policy returns: XML or JSON."
      }
    ]
  },
  "AssertCondition": {
    "name": "AssertCondition",
    "doc": "Defines an <AssertCondition> policy. By using this policy, you can evaluate a conditional statement that has one or more conditions joined by a logical operator. For information about all the supported operators in a condition, see…",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Condition",
        "doc": "Specifies the condition to evaluate. For more information about writing a conditional statement in Apigee, see Conditions reference.",
        "required": true
      }
    ]
  },
  "AssignMessage": {
    "name": "AssignMessage",
    "doc": "Defines an AssignMessage policy.",
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
                "repeatable": true,
                "children": [
                  {
                    "name": "QueryParams",
                    "doc": "Adds new query parameters to the request. This element has no effect on a response."
                  }
                ]
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
            ],
            "default": "False"
          },
          {
            "name": "Verb",
            "doc": "Determines whether the HTTP verb is copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ],
            "default": "False"
          },
          {
            "name": "StatusCode",
            "doc": "Determines whether the status code is copied from the source response to the destination response.",
            "values": [
              "false",
              "true"
            ],
            "default": "False"
          },
          {
            "name": "Path",
            "doc": "Determines whether the path should be copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ],
            "default": "False"
          },
          {
            "name": "Version",
            "doc": "Determines whether the HTTP version is copied from the source request to the destination request.",
            "values": [
              "false",
              "true"
            ],
            "default": "False"
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
                "repeatable": true,
                "children": [
                  {
                    "name": "QueryParams",
                    "doc": "Adds new query parameters to the request. This element has no effect on a response."
                  }
                ]
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
            "doc": "Determines whether <Remove> deletes the payload in the request or response, which is specified by the <AssignTo> element.",
            "values": [
              "true",
              "false"
            ],
            "default": "False"
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
                "name": "QueryParams",
                "doc": "Adds new query parameters to the request. This element has no effect on a response."
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
                ],
                "children": [
                  {
                    "name": "QueryParams",
                    "doc": "Adds new query parameters to the request. This element has no effect on a response."
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
                ],
                "children": [
                  {
                    "name": "QueryParams",
                    "doc": "Adds new query parameters to the request. This element has no effect on a response."
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
            "doc": "Sometimes you might need to send a message to a URL other than the URL defined in an API proxy's TargetEndpoint.",
            "values": [
              "true",
              "false"
            ],
            "default": "False"
          },
          {
            "name": "Payload",
            "doc": "Defines the message body for a request or response, which is specified by the <AssignTo> element.",
            "values": [
              "true",
              "false"
            ],
            "default": "False",
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
                    "required": true,
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
                            "required": true,
                            "attrs": [
                              {
                                "name": "ref"
                              }
                            ]
                          }
                        ]
                      },
                      {
                        "name": "Scopes",
                        "doc": "Identifies the scopes to be included in the OAuth 2.0 access token.",
                        "required": true,
                        "children": [
                          {
                            "name": "Scope",
                            "doc": "Specifies a valid Google API scope. For more information, see OAuth 2.0 Scopes for Google APIs."
                          }
                        ]
                      },
                      {
                        "name": "Audience",
                        "doc": "The audience for the generated authentication token, such as the API or account that the token grants access to.",
                        "required": true
                      }
                    ]
                  },
                  {
                    "name": "GoogleIDToken",
                    "doc": "Generates Google-issued OpenID Connect tokens to make authenticated calls to Google services."
                  },
                  {
                    "name": "Audience",
                    "doc": "The audience for the generated authentication token, such as the API or account that the token grants access to.",
                    "required": true
                  }
                ]
              },
              {
                "name": "GoogleIDToken",
                "doc": "Generates Google-issued OpenID Connect tokens to make authenticated calls to Google services."
              }
            ]
          },
          {
            "name": "StatusCode",
            "doc": "Sets the status code on the response. This element has no effect on a request.",
            "values": [
              "true",
              "false"
            ],
            "default": "False"
          },
          {
            "name": "Verb",
            "doc": "Sets the HTTP verb on the request. This element has no effect on a response.",
            "values": [
              "true",
              "false"
            ],
            "default": "False"
          },
          {
            "name": "Version",
            "doc": "Sets the HTTP version on a request. This element has no effect on a response.",
            "values": [
              "true",
              "false"
            ],
            "default": "False"
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
            "required": true,
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
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Operation",
        "doc": "Determines whether the policy Base64 encodes or decodes credentials.",
        "required": true
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "When set to true, the policy will not throw an error if a variable cannot be resolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "true"
      },
      {
        "name": "User",
        "doc": "<User ref=\"request.queryparam.username\" /> Default: N/A Presence: Required Type: N/A",
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Password",
        "doc": "<Password ref=\"request.queryparam.password\" /> Default: N/A Presence: Required Type: N/A",
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "AssignTo",
        "doc": "Specifies the target variable to set with the encoded or decoded value generated by this policy.",
        "required": true,
        "attrs": [
          {
            "name": "createNew"
          }
        ]
      },
      {
        "name": "Source",
        "doc": "For decoding, the variable containing the Base64 encoded string, in the form Basic Base64EncodedString."
      }
    ]
  },
  "CORS": {
    "name": "CORS",
    "doc": "Defines the CORS policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "AllowOrigins",
        "doc": "A list of origins that are allowed to access the resource.",
        "required": true
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
        "doc": "Specifies how long the results of a preflight request can be cached in seconds.",
        "default": "1800"
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
        "default": "true",
        "repeatable": true
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "false",
          "true"
        ],
        "default": "true"
      }
    ]
  },
  "DataCapture": {
    "name": "DataCapture",
    "doc": "The <DataCapture> element defines a DataCapture policy.",
    "children": [
      {
        "name": "Capture",
        "doc": "The <Capture> element specifies the means of capturing the data.",
        "repeatable": true,
        "children": [
          {
            "name": "DataCollector",
            "doc": "The <DataCollector> element specifies the data collector resource.",
            "attrs": [
              {
                "name": "scope",
                "doc": "Specify this attribute and set the value to monetization if you want to capture the monetization variables."
              }
            ],
            "repeatable": true,
            "children": [
              {
                "name": "DataCollector",
                "doc": "The <DataCollector> element specifies the data collector resource.",
                "attrs": [
                  {
                    "name": "scope",
                    "doc": "Specify this attribute and set the value to monetization if you want to capture the monetization variables."
                  }
                ],
                "children": [
                  {
                    "name": "Collect",
                    "doc": "The <Collect> element specifies the means for capturing data.",
                    "attrs": [
                      {
                        "name": "ref",
                        "doc": "The variable for which you are capturing data."
                      },
                      {
                        "name": "default",
                        "doc": "Specifies the value that is sent to Analytics if the value of the variable is not populated at runtime."
                      }
                    ],
                    "children": [
                      {
                        "name": "JSONPayload",
                        "doc": "Specifies the JSON-formatted message from which the value of the variable will be extracted.",
                        "children": [
                          {
                            "name": "JSONPath",
                            "doc": "Required child element of the <JSONPayload> element.",
                            "required": true
                          }
                        ]
                      },
                      {
                        "name": "Source",
                        "doc": "Specifies a variable naming the message to be parsed."
                      },
                      {
                        "name": "URIPath",
                        "doc": "Extracts a value from the proxy.pathsuffix of a request source message."
                      },
                      {
                        "name": "QueryParam",
                        "doc": "Extracts a value from the specified query parameter of a request source message."
                      },
                      {
                        "name": "Header",
                        "doc": "Extracts a value from the specified HTTP header of the specified request or response message."
                      },
                      {
                        "name": "FormParam",
                        "doc": "Extracts a value from the specified form parameter of the specified request or response message."
                      },
                      {
                        "name": "XMLPayload",
                        "doc": "Specifies the XML-formatted message from which the value of the variable will be extracted.",
                        "children": [
                          {
                            "name": "XPath",
                            "doc": "Required child element of the XMLPayload element.",
                            "required": true
                          }
                        ]
                      },
                      {
                        "name": "Namespaces",
                        "doc": "Specifies the set of namespaces that can be used in the XPath expression.",
                        "children": [
                          {
                            "name": "Namespace",
                            "doc": "Specifies one namespace and a corresponding prefix for use within the XPath expression."
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
            "doc": "The <Collect> element specifies the means for capturing data.",
            "attrs": [
              {
                "name": "ref",
                "doc": "The variable for which you are capturing data."
              },
              {
                "name": "default",
                "doc": "Specifies the value that is sent to Analytics if the value of the variable is not populated at runtime."
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
                    "doc": "Required child element of the <JSONPayload> element.",
                    "required": true
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
              },
              {
                "name": "QueryParam",
                "doc": "Extracts a value from the specified query parameter of a request source message."
              },
              {
                "name": "Header",
                "doc": "Extracts a value from the specified HTTP header of the specified request or response message."
              },
              {
                "name": "FormParam",
                "doc": "Extracts a value from the specified form parameter of the specified request or response message."
              },
              {
                "name": "XMLPayload",
                "doc": "Specifies the XML-formatted message from which the value of the variable will be extracted.",
                "children": [
                  {
                    "name": "XPath",
                    "doc": "Required child element of the XMLPayload element.",
                    "required": true
                  }
                ]
              },
              {
                "name": "Namespaces",
                "doc": "Specifies the set of namespaces that can be used in the XPath expression.",
                "children": [
                  {
                    "name": "Namespace",
                    "doc": "Specifies one namespace and a corresponding prefix for use within the XPath expression."
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
        "name": "ThrowExceptionOnLimit",
        "doc": "The <ThrowExceptionOnLimit> element specifices what happens when the capture limits on the number of variables or the maximum size of a variable are reached."
      },
      {
        "name": "DataCollector",
        "doc": "The <DataCollector> element specifies the data collector resource.",
        "attrs": [
          {
            "name": "scope",
            "doc": "Specify this attribute and set the value to monetization if you want to capture the monetization variables."
          }
        ]
      },
      {
        "name": "Collect",
        "doc": "The <Collect> element specifies the means for capturing data.",
        "attrs": [
          {
            "name": "ref",
            "doc": "The variable for which you are capturing data."
          },
          {
            "name": "default",
            "doc": "Specifies the value that is sent to Analytics if the value of the variable is not populated at runtime."
          }
        ],
        "children": [
          {
            "name": "Source",
            "doc": "Specifies a variable naming the message to be parsed."
          },
          {
            "name": "URIPath",
            "doc": "Extracts a value from the proxy.pathsuffix of a request source message."
          },
          {
            "name": "QueryParam",
            "doc": "Extracts a value from the specified query parameter of a request source message."
          },
          {
            "name": "Header",
            "doc": "Extracts a value from the specified HTTP header of the specified request or response message."
          },
          {
            "name": "FormParam",
            "doc": "Extracts a value from the specified form parameter of the specified request or response message."
          },
          {
            "name": "JSONPayload",
            "doc": "Specifies the JSON-formatted message from which the value of the variable will be extracted.",
            "children": [
              {
                "name": "JSONPath",
                "doc": "Required child element of the <JSONPayload> element.",
                "required": true
              }
            ]
          },
          {
            "name": "XMLPayload",
            "doc": "Specifies the XML-formatted message from which the value of the variable will be extracted.",
            "children": [
              {
                "name": "XPath",
                "doc": "Required child element of the XMLPayload element.",
                "required": true
              }
            ]
          },
          {
            "name": "Namespaces",
            "doc": "Specifies the set of namespaces that can be used in the XPath expression.",
            "children": [
              {
                "name": "Namespace",
                "doc": "Specifies one namespace and a corresponding prefix for use within the XPath expression."
              }
            ]
          }
        ]
      }
    ]
  },
  "DecodeJWS": {
    "name": "DecodeJWS",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Source",
        "doc": "<Source>JWS-variable</Source> If present, specifies the flow variable in which the policy expects to find the JWS to decode."
      }
    ]
  },
  "DecodeJWT": {
    "name": "DecodeJWT",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the Apigee UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Source",
        "doc": "<Source>jwt-variable</Source> If present, specifies the flow variable in which the policy expects to find the JWT to decode."
      }
    ]
  },
  "DeleteOAuthV2Info": {
    "name": "DeleteOAuthV2Info",
    "children": [
      {
        "name": "AccessToken",
        "doc": "Identifies the variable where the access token to delete is located.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "AuthorizationCode",
        "doc": "Identifies the variable where the authorization code to delete is located.",
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
    "doc": "Defines an ExternalCallout policy.",
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
            "doc": "Specifies the gRPC server.",
            "attrs": [
              {
                "name": "name",
                "doc": "The name of an existing TargetServer to be the gRPC server to send requests to.",
                "required": true
              }
            ]
          },
          {
            "name": "Authentication",
            "doc": "Generates a Google-issued OpenID Connect token to make authenticated calls to gRPC-based services, such as custom services hosted in Cloud Run.",
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
                "name": "name",
                "doc": "Specifies what content will be sent to the server.",
                "required": true
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
        "name": "Server",
        "doc": "Specifies the gRPC server.",
        "attrs": [
          {
            "name": "name",
            "doc": "The name of an existing TargetServer to be the gRPC server to send requests to.",
            "required": true
          }
        ]
      },
      {
        "name": "Property",
        "doc": "The <Property> element specifies whether request/response headers and/or content will be sent to the server.",
        "attrs": [
          {
            "name": "name",
            "doc": "Specifies what content will be sent to the server.",
            "required": true
          }
        ]
      },
      {
        "name": "FlowVariable",
        "doc": "The <FlowVariable> element specifies what additional flow variables will be sent to the server."
      }
    ]
  },
  "ExtractVariables": {
    "name": "ExtractVariables",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Source",
        "doc": "(Optional) Specifies the variable to be parsed.",
        "default": "message",
        "attrs": [
          {
            "name": "clearPayload"
          }
        ]
      },
      {
        "name": "URIPath",
        "doc": "(Optional, but see the Presence row in the table below for more information.) Extracts a value from the proxy.pathsuffix of a request source message.",
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
        "name": "VariablePrefix",
        "doc": "(Optional) The complete variable name is created by joining the <VariablePrefix>, a dot, and the name you define in {curly braces} in the <Pattern> element or <Variable> element."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "(Optional) Set to true to treat any unresolvable variable as an empty string (null).",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      },
      {
        "name": "QueryParam",
        "doc": "(Optional, but see the Presence row in the table below for more information.) Extracts a value from the specified query parameter of a request source message.",
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
        "doc": "(Optional, but see the Presence row in the table below for more information.) Extracts a value from the specified HTTP header of the specified request or response message.",
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
        "doc": "(Optional, but see the Presence row in the table below for more information.) Specifies the JSON-formatted message from which the value of the variable will be extracted.",
        "children": [
          {
            "name": "Variable",
            "doc": "(Optional, but see the Presence row in the table below for more information.) Specifies the name of a variable from which to extract a value.",
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
        "doc": "(Optional, but see the Presence row in the table below for more information.) Specifies the XML-formatted message from which the value of the variable will be extracted.",
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
            "doc": "(Optional, but see the Presence row in the table below for more information.) Specifies the name of a variable from which to extract a value.",
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
        "doc": "(Optional, but see the Presence row in the table below for more information.) Extracts a value from the specified form parameter of the specified request or response message.",
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
        "doc": "(Optional, but see the Presence row in the table below for more information.) Specifies the name of a variable from which to extract a value.",
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "SharedFlowBundle",
        "doc": "Specifies the name of the shared flow to call.",
        "required": true
      },
      {
        "name": "Parameters",
        "doc": "Specifies the set of <Parameter> elements to pass as variables into the shared flow called by this policy.",
        "children": [
          {
            "name": "Parameter",
            "doc": "Specifies a parameter and value (or value source) to pass as a variable into the shared flow called by this policy.",
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
        "name": "Parameter",
        "doc": "Specifies a parameter and value (or value source) to pass as a variable into the shared flow called by this policy."
      }
    ]
  },
  "GenerateJWS": {
    "name": "GenerateJWS",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the Apigee UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Algorithm",
        "doc": "<Algorithm>algorithm-here</Algorithm> Specifies the encryption algorithm to sign the token.",
        "values": [
          "HS256",
          "HS384",
          "HS512",
          "RS256",
          "RS384",
          "RS512",
          "ES256",
          "ES384",
          "ES512",
          "PS256",
          "PS384",
          "PS512"
        ],
        "required": true
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "<IgnoreUnresolvedVariables>true|false</IgnoreUnresolvedVariables> Set to false if you want the policy to throw an error when any referenced variable specified in the policy is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "SecretKey",
        "doc": "<SecretKey encoding=\"base16|hex|base64|base64url\" > <Id ref=\"variable-containing-key-id-here\">secret-key-id</Id> <Value ref=\"private.variable-here\"/> </SecretKey> Specifies the secret key to use when generating a JWS that uses a symmetric…",
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
        "doc": "<Payload ref=\"flow-variable-name-here\" /> or <Payload>payload-value</Payload> Specifies the raw, unencoded JWS payload.",
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "OutputVariable",
        "doc": "<OutputVariable>output-variable</OutputVariable> Specifies the name of the context variable that the policy will set with the generated JWS.",
        "default": "jws.POLICYNAME.generated_jws"
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
        "doc": "This is optional, for use only when the <Algorithm> is one of the RS*, PS*, or ES* options.",
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
        "name": "DetachContent",
        "doc": "<DetachContent>true|false</DetachContent> Specifies whether to generate the JWS with a detached payload, <DetachContent>true</DetachContent>, or not, <DetachContent>false</DetachContent>.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "CriticalHeaders",
        "doc": "<CriticalHeaders>a,b,c</CriticalHeaders> or: <CriticalHeaders ref=\"variable_containing_headers\"/> Adds the critical header, crit, to the JWS."
      },
      {
        "name": "Type",
        "doc": "<Type>type-string-here</Type> Optional element whose only allowed value is Signed, specifying that the policy generates a signed JWS."
      }
    ]
  },
  "GenerateJWT": {
    "name": "GenerateJWT",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the Apigee UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Type",
        "doc": "<Type>type-string-here</Type> Describes whether the policy generates a signed JWT or an encrypted JWT."
      },
      {
        "name": "Algorithm",
        "doc": "<Algorithm>algorithm-here</Algorithm> Specifies the cryptographic algorithm used to sign the token.",
        "values": [
          "HS256",
          "HS384",
          "HS512",
          "RS256",
          "RS384",
          "RS512",
          "ES256",
          "ES384",
          "ES512",
          "PS256",
          "PS384",
          "PS512"
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "<IgnoreUnresolvedVariables>true|false</IgnoreUnresolvedVariables> Set to false if you want the policy to throw an error when any referenced variable specified in the policy is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      },
      {
        "name": "SecretKey",
        "doc": "<SecretKey encoding=\"base16|hex|base64|base64url\" > <Id ref=\"variable-containing-key-id-here\">secret-key-id</Id> <Value ref=\"private.variable-here\"/> </SecretKey> The SecretKey element is optional.",
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
            "name": "Id",
            "doc": "<Id>explicit-jti-value-here</Id> -or- <Id ref='variable-name-here'/> -or- <Id/> Generates a JWT with the specific jti claim."
          }
        ]
      },
      {
        "name": "ExpiresIn",
        "doc": "<ExpiresIn>time-value-here</ExpiresIn> or: <ExpiresIn ref='time-value-here'/> Specifies the lifespan of the JWT in milliseconds, seconds, minutes, hours, or days."
      },
      {
        "name": "Subject",
        "doc": "<Subject>subject-string-here</Subject> or <Subject ref=\"flow_variable\" /> For example:"
      },
      {
        "name": "Issuer",
        "doc": "<Issuer ref='variable-name-here'/> <Issuer>issuer-string-here</Issuer> The policy generates a JWT containing a claim with name iss, with a value set to the specified value."
      },
      {
        "name": "Audience",
        "doc": "<Audience>audience-here</Audience> or: <Audience ref='variable_containing_audience'/> The policy generates a JWT containing an aud claim set to the specified value."
      },
      {
        "name": "Id",
        "doc": "<Id>explicit-jti-value-here</Id> -or- <Id ref='variable-name-here'/> -or- <Id/> Generates a JWT with the specific jti claim."
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
        "name": "OutputVariable",
        "doc": "<OutputVariable>jwt-variable</OutputVariable> Specifies where to place the JWT generated by this policy.",
        "default": "jwt.POLICYNAME.generated_jwt"
      },
      {
        "name": "PrivateKey",
        "doc": "<PrivateKey> <Id ref=\"privatekey-id\"/> <Value ref=\"private.pem-encoded-privatekey\"/> <Password ref=\"private.privatekey-password\"/> </PrivateKey> Specifies the private key to use when generating a signed JWT, and the Algorithm is an RSA or…",
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
            "doc": "<Id>explicit-jti-value-here</Id> -or- <Id ref='variable-name-here'/> -or- <Id/> Generates a JWT with the specific jti claim.",
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
        "doc": "<Algorithms> <Key>key-algorithm</Key> <Content>content-algorithm</Content> </Algorithms> Specifies the cryptographic algorithms for the key and content encryption.",
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
        "doc": "<PublicKey> <!-- specify exactly one of the following --> <Value ref=\"variable-containing-encoded-publickey\"/> <Value>PEM encoded public key</Value> <Certificate ref=\"variable-containing-encoded-x509-certificate\"/> <Certificate>PEM…",
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
      },
      {
        "name": "Compress",
        "doc": "<Compress>true</Compress> Specifies whether text is compressed before encrypting."
      },
      {
        "name": "CriticalHeaders",
        "doc": "<CriticalHeaders>a,b,c</CriticalHeaders> or: <CriticalHeaders ref=’variable_containing_headers’/> Adds the critical header, crit, to the JWT header."
      },
      {
        "name": "CustomClaims",
        "doc": "Note: Currently, a CustomClaims element is inserted when you add a new GenerateJWT policy through the UI."
      },
      {
        "name": "DirectKey",
        "doc": "<DirectKey> <Id>A12345</Id> <Value encoding=\"base16|hex|base64|base64url\" ref=\"private.directkey\"/> </DirectKey> Specifies a direct key for encrypting a JWT when the encryption algorithm is dir (\"direct encryption\")."
      },
      {
        "name": "NotBefore",
        "doc": "<!-- Specify an absolute time. --> <NotBefore>2017-08-14T11:00:21-07:00</NotBefore> -or- <!-- Specify a time relative to when the token is generated. --> <NotBefore>6h</NotBefore> Specifies the time when the token becomes valid. The token…"
      },
      {
        "name": "PasswordKey",
        "doc": "<PasswordKey> <Id>abcdefg</Id> <Value ref=\"private.password\"/> <SaltLength>8</SaltLength> <PBKDF2Iterations>10000</PBKDF2> </PasswordKey> Specifies a key for encrypting a JWT when the encryption algorithm is one of the following:"
      }
    ]
  },
  "GetOAuthV2Info": {
    "name": "GetOAuthV2Info",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "AccessToken",
        "doc": "Retrieves the profile for an access token."
      },
      {
        "name": "AuthorizationCode",
        "doc": "Retrieves the profile for an authorization code."
      },
      {
        "name": "ClientId",
        "doc": "Retrieves information related to a client ID."
      },
      {
        "name": "IgnoreAccessTokenStatus",
        "doc": "Returns the token information even if the token is expired or revoked.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "RefreshToken",
        "doc": "Retrieves the profile for a refresh token."
      }
    ]
  },
  "GraphQL": {
    "name": "GraphQL",
    "doc": "Defines a <GraphQL> policy.",
    "children": [
      {
        "name": "Source",
        "doc": "Source on which this policy executes.",
        "default": "request"
      },
      {
        "name": "OperationType",
        "doc": "Indicates the type of request that can be parsed:",
        "values": [
          "query",
          "mutuation",
          "all"
        ],
        "default": "query"
      },
      {
        "name": "MaxDepth",
        "doc": "The maximum depth of the query, when represented as a tree.",
        "default": "10"
      },
      {
        "name": "MaxCount",
        "doc": "The maximum number of fragments that can be in the payload.",
        "default": "10"
      },
      {
        "name": "MaxPayloadSizeInBytes",
        "doc": "The maximum size of a payload in kilobytes.",
        "default": "request",
        "children": [
          {
            "name": "Action",
            "doc": "Action represents one of the following GraphQL actions:",
            "default": "parse"
          },
          {
            "name": "ResourceURL",
            "doc": "The path to the GraphQL schema file that the GraphQL policy verifies requests against."
          }
        ]
      },
      {
        "name": "Action",
        "doc": "Action represents one of the following GraphQL actions:",
        "default": "parse"
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
        "name": "Algorithm",
        "doc": "<Algorithm>algorithm-name</Algorithm> Specifies the hash algorithm to use when computing the HMAC.",
        "required": true
      },
      {
        "name": "SecretKey",
        "doc": "<SecretKey encoding='encoding_name' ref='private.secretkey'/> Specifies the secret key used to compute the HMAC.",
        "required": true
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "<IgnoreUnresolvedVariables>true|false</IgnoreUnresolvedVariables> Set to false if you want the policy to throw an error when any referenced variable specified in the policy is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      },
      {
        "name": "Message",
        "doc": "<Message>message_template_here</Message> or <Message ref='variable_here'/> Specifies the message payload to sign.",
        "required": true
      },
      {
        "name": "Output",
        "doc": "<Output encoding='encoding_name'>variable_name</Output> Specifies the name of the variable that the policy should set with the computed HMAC value."
      },
      {
        "name": "VerificationValue",
        "doc": "<VerificationValue encoding='encoding_name' ref='variable_name'/> or <VerificationValue encoding='encoding_name'>string_value</VerificationValue> (Optional) Specifies the verification value, as well as the encoding that was used to encode…"
      }
    ]
  },
  "HTTPModifier": {
    "name": "HTTPModifier",
    "doc": "Defines an HTTPModifier policy.",
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
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
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
    "doc": "Specifies the IntegrationCallout policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "AsyncExecution",
        "doc": "Specifies the mode to run the integration.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "Request",
        "doc": "Specifies the flow variable having the request object created by the SetIntegrationRequest policy.",
        "required": true,
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
        "doc": "Specifies the flow variable for saving the integration's response.",
        "default": "integration.response"
      }
    ]
  },
  "InvalidateCache": {
    "name": "InvalidateCache",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "CacheKey",
        "doc": "Configures a unique pointer to a piece of data stored in the cache.",
        "required": true,
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
        "name": "CacheResource",
        "doc": "Specifies the cache where messages should be stored."
      },
      {
        "name": "Scope",
        "doc": "Enumeration used to construct a prefix for a cache key when a <Prefix> element is not provided in the <CacheKey> element."
      },
      {
        "name": "CacheContext",
        "doc": "Specifies how to construct a cache key when a Prefix element value is not specified, or to clear cache entries added by another API proxy.",
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
        "name": "PurgeChildEntries",
        "doc": "true to purge cache entries that share the same <Prefix> value configured for this policy, even if the PopulateCache policy instances that loaded those items into cache also used various <KeyFragment> elements.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      }
    ]
  },
  "JavaCallout": {
    "name": "JavaCallout",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "ClassName",
        "doc": "Specifies the name of the Java class that executes when the JavaCallout policy runs.",
        "required": true
      },
      {
        "name": "ResourceURL",
        "doc": "This element specifies the Java JAR file that will execute when the JavaCallout policy runs.",
        "required": true
      },
      {
        "name": "Properties",
        "doc": "Adds new properties that you can access from Java code at runtime.",
        "children": [
          {
            "name": "Property",
            "doc": "Specifies a property you can access from Java code at runtime.",
            "attrs": [
              {
                "name": "name"
              }
            ]
          }
        ]
      },
      {
        "name": "Property",
        "doc": "Specifies a property you can access from Java code at runtime."
      }
    ]
  },
  "Javascript": {
    "name": "Javascript",
    "attrs": [
      {
        "name": "timeLimit"
      }
    ],
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Properties",
        "children": [
          {
            "name": "Property",
            "doc": "Specifies a property you can access from JavaScript code at runtime.",
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
        "name": "ResourceURL",
        "doc": "Specifies the main JavaScript file that executes in the API flow."
      },
      {
        "name": "SSLInfo",
        "doc": "Specifies the properties used to configure TLS for all HTTP client instances created by the JavaScript policy.",
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
        "name": "IncludeURL",
        "doc": "Specifies a JavaScript library file to load as a dependency for the main JavaScript file specified with the <ResourceURL> or <Source> element."
      },
      {
        "name": "Source"
      },
      {
        "name": "Property",
        "doc": "Specifies a property you can access from JavaScript code at runtime."
      }
    ]
  },
  "JSONThreatProtection": {
    "name": "JSONThreatProtection",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "ArrayElementCount",
        "doc": "Specifies the maximum number of elements allowed in an array."
      },
      {
        "name": "ContainerDepth",
        "doc": "Specifies the maximum allowed containment depth, where the containers are objects or arrays."
      },
      {
        "name": "ObjectEntryCount",
        "doc": "Specifies the maximum number of entries allowed in an object."
      },
      {
        "name": "ObjectEntryNameLength",
        "doc": "Specifies the maximum string length allowed for a property name within an object."
      },
      {
        "name": "Source",
        "doc": "Message to be screened for JSON payload attacks.",
        "default": "request"
      },
      {
        "name": "StringValueLength",
        "doc": "Specifies the maximum length allowed for a string value."
      }
    ]
  },
  "JSONToXML": {
    "name": "JSONToXML",
    "children": [
      {
        "name": "Source",
        "doc": "The variable, request or response, that contains the JSON message that you want to convert to XML."
      },
      {
        "name": "OutputVariable",
        "doc": "Stores the output of the JSON to XML format conversion."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
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
    "doc": "Provides policy-based access to a key value map (KVM).",
    "attrs": [
      {
        "name": "mapIdentifier"
      }
    ],
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "ExpiryTimeInSecs",
        "doc": "Specifies the duration in seconds after which Apigee refreshes its cached value from the specified KVM."
      },
      {
        "name": "Scope",
        "doc": "Defines the boundary of accessibility for KVMs.",
        "values": [
          "organization",
          "environment",
          "apiproxy"
        ],
        "default": "environment"
      },
      {
        "name": "Put",
        "doc": "Writes a key/value pair to a KVM. If the KVM specified in the mapIdentifier attribute on the root element doesn't exist and if the <MapName> element is not used, the map is automatically created. If the key value map already exists, the…",
        "attrs": [
          {
            "name": "override"
          }
        ],
        "children": [
          {
            "name": "Key",
            "doc": "Specifies the key in a KVM entry. This element appears as a child of <Get>, <Put>, or <Delete>, or as a child of the <Entry> element that is a child of <InitialEntries>. Here's an example of a fixed key:",
            "children": [
              {
                "name": "Parameter",
                "doc": "Specifies a component of a key in a key/value pair.",
                "required": true,
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
            "doc": "Specifies the value of a key. You can specify the value as either a literal string or, using the ref attribute, as a variable to be retrieved at run time:",
            "required": true,
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
        "doc": "Retrieves the value for the key specified.",
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
            "doc": "Specifies the key in a KVM entry. This element appears as a child of <Get>, <Put>, or <Delete>, or as a child of the <Entry> element that is a child of <InitialEntries>. Here's an example of a fixed key:",
            "children": [
              {
                "name": "Parameter",
                "doc": "Specifies a component of a key in a key/value pair.",
                "required": true,
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
        "doc": "The <MapName> element enables the policy to identify which KVM to use dynamically, at runtime.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "InitialEntries",
        "doc": "Seed values for KVMs, which are populated in the KVM when it is initialized.",
        "children": [
          {
            "name": "Entry",
            "doc": "Seed values for KVMs, which are populated in the KVM when it is initialized.",
            "repeatable": true,
            "children": [
              {
                "name": "Key",
                "doc": "Specifies the key in a KVM entry. This element appears as a child of <Get>, <Put>, or <Delete>, or as a child of the <Entry> element that is a child of <InitialEntries>. Here's an example of a fixed key:",
                "repeatable": true,
                "children": [
                  {
                    "name": "Parameter",
                    "doc": "Specifies a component of a key in a key/value pair.",
                    "required": true,
                    "repeatable": true
                  }
                ]
              },
              {
                "name": "Value",
                "doc": "Specifies the value of a key. You can specify the value as either a literal string or, using the ref attribute, as a variable to be retrieved at run time:",
                "required": true,
                "repeatable": true
              }
            ]
          }
        ]
      },
      {
        "name": "Delete",
        "doc": "Deletes the specified key/value pair. At least one of <Get>, <Put>, or <Delete> must be used.",
        "children": [
          {
            "name": "Key",
            "doc": "Specifies the key in a KVM entry. This element appears as a child of <Get>, <Put>, or <Delete>, or as a child of the <Entry> element that is a child of <InitialEntries>. Here's an example of a fixed key:",
            "children": [
              {
                "name": "Parameter",
                "doc": "Specifies a component of a key in a key/value pair.",
                "required": true
              }
            ]
          }
        ]
      },
      {
        "name": "Entry",
        "doc": "Seed values for KVMs, which are populated in the KVM when it is initialized."
      },
      {
        "name": "ExclusiveCache",
        "doc": "Deprecated. Use the <Scope> element instead."
      },
      {
        "name": "Key",
        "doc": "Specifies the key in a KVM entry. This element appears as a child of <Get>, <Put>, or <Delete>, or as a child of the <Entry> element that is a child of <InitialEntries>. Here's an example of a fixed key:"
      },
      {
        "name": "Parameter",
        "doc": "Specifies a component of a key in a key/value pair.",
        "required": true
      },
      {
        "name": "Value",
        "doc": "Specifies the value of a key. You can specify the value as either a literal string or, using the ref attribute, as a variable to be retrieved at run time:",
        "required": true
      }
    ]
  },
  "LLMTokenQuota": {
    "name": "LLMTokenQuota",
    "doc": "Following are attributes and child elements of <LLMTokenQuota>.",
    "attrs": [
      {
        "name": "type",
        "doc": "Sets the LLMTokenQuota policy type, which determines when and how the quota counter checks quota usage as well as how it resets.",
        "values": [
          "calendar",
          "rollingwindow",
          "flexi"
        ]
      }
    ],
    "children": [
      {
        "name": "Interval",
        "doc": "Specifies the number of time periods in which quotas are calculated.",
        "required": true,
        "attrs": [
          {
            "name": "ref",
            "doc": "Use to specify a flow variable containing the interval for a quota."
          }
        ]
      },
      {
        "name": "TimeUnit",
        "doc": "Specifies the unit of time applicable to the quota.",
        "required": true,
        "attrs": [
          {
            "name": "ref",
            "doc": "Specifies a flow variable containing the time unit for a quota."
          }
        ]
      },
      {
        "name": "Allow",
        "doc": "Specifies the total number of tokens allowed for the specified time interval.",
        "attrs": [
          {
            "name": "count",
            "doc": "Use to specify a token count for the quota.",
            "default": "2000"
          },
          {
            "name": "countRef",
            "doc": "Use to specify a flow variable containing the token count for a quota."
          }
        ],
        "repeatable": true,
        "children": [
          {
            "name": "Class",
            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
            "attrs": [
              {
                "name": "ref",
                "doc": "Use to specify a flow variable containing the quota class for a quota.",
                "required": true
              }
            ],
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                "attrs": [
                  {
                    "name": "class",
                    "doc": "Defines the name of the quota counter.",
                    "required": true
                  },
                  {
                    "name": "count",
                    "doc": "Specifies the quota limit for the counter.",
                    "required": true
                  }
                ],
                "repeatable": true,
                "children": [
                  {
                    "name": "Class",
                    "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                    "attrs": [
                      {
                        "name": "ref",
                        "doc": "Use to specify a flow variable containing the quota class for a quota.",
                        "required": true
                      }
                    ],
                    "children": [
                      {
                        "name": "Allow",
                        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                        "attrs": [
                          {
                            "name": "class",
                            "doc": "Defines the name of the quota counter.",
                            "required": true
                          },
                          {
                            "name": "count",
                            "doc": "Specifies the quota limit for the counter.",
                            "required": true
                          }
                        ],
                        "children": [
                          {
                            "name": "Class",
                            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                            "attrs": [
                              {
                                "name": "ref",
                                "doc": "Use to specify a flow variable containing the quota class for a quota.",
                                "required": true
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
          }
        ]
      },
      {
        "name": "Identifier",
        "doc": "Configures the policy to create unique counters based on a flow variable.",
        "attrs": [
          {
            "name": "ref",
            "doc": "Specifies a flow variable that identifies the counter to use for the request."
          }
        ]
      },
      {
        "name": "StartTime",
        "doc": "When type is set to calendar, specifies the date and time when the quota counter begins counting, regardless of whether any requests have been received from any apps."
      },
      {
        "name": "SharedName",
        "doc": "Identifies this LLMTokenQuota policy as shared."
      },
      {
        "name": "EnforceOnly",
        "doc": "Place an LLMTokenQuota policy with this element set to true in the request flow of an API proxy to enforce a token limit without incrementing the quota counter.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "Distributed",
        "doc": "Determines whether Apigee uses one or more nodes to process requests.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "CountOnly",
        "doc": "Place an LLMTokenQuota policy with this element set to true in a step in the ProxyEndpoint response flow to track the number of tokens without sending an error back to the client when the token quota limit is exceeded.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "LLMTokenUsageSource",
        "doc": "Provides the source of the token usage from the LLM response."
      },
      {
        "name": "LLMModelSource",
        "doc": "Provides the source of the model name from the LLM response or LLM request."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Synchronous",
        "doc": "Determines whether to update a distributed quota counter synchronously.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "AsynchronousConfiguration",
        "doc": "Configures the synchronization interval among distributed quota counters when the policy configuration element <Synchronous> is either not present or present and set to false.",
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
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing of the LLMTokenQuota policy stops if Apigee cannot resolve a variable referenced by the ref attribute in the policy.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "UseQuotaConfigInAPIProduct",
        "doc": "Defines quota settings for an API product, such as the time units, interval, and allowed maximum.",
        "attrs": [
          {
            "name": "stepName",
            "doc": "Identifies the name of the authentication policy in the flow.",
            "required": true
          }
        ],
        "children": [
          {
            "name": "DefaultConfig",
            "doc": "Contains default values for an API product's quota.",
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the total number of tokens allowed for the specified time interval.",
                "attrs": [
                  {
                    "name": "count",
                    "doc": "Use to specify a token count for the quota.",
                    "default": "2000"
                  },
                  {
                    "name": "countRef",
                    "doc": "Use to specify a flow variable containing the token count for a quota."
                  }
                ],
                "children": [
                  {
                    "name": "Class",
                    "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                    "attrs": [
                      {
                        "name": "ref",
                        "doc": "Use to specify a flow variable containing the quota class for a quota.",
                        "required": true
                      }
                    ],
                    "children": [
                      {
                        "name": "Allow",
                        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                        "attrs": [
                          {
                            "name": "class",
                            "doc": "Defines the name of the quota counter.",
                            "required": true
                          },
                          {
                            "name": "count",
                            "doc": "Specifies the quota limit for the counter.",
                            "required": true
                          }
                        ],
                        "repeatable": true,
                        "children": [
                          {
                            "name": "Class",
                            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                            "attrs": [
                              {
                                "name": "ref",
                                "doc": "Use to specify a flow variable containing the quota class for a quota.",
                                "required": true
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
                "name": "Interval",
                "doc": "Specifies the number of time periods in which quotas are calculated.",
                "required": true,
                "attrs": [
                  {
                    "name": "ref",
                    "doc": "Use to specify a flow variable containing the interval for a quota."
                  }
                ]
              },
              {
                "name": "TimeUnit",
                "doc": "Specifies the unit of time applicable to the quota.",
                "required": true,
                "attrs": [
                  {
                    "name": "ref",
                    "doc": "Specifies a flow variable containing the time unit for a quota."
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "CacheKey",
        "doc": "Configures a unique pointer to a piece of data stored in the cache.",
        "required": true,
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
        "name": "CacheResource",
        "doc": "Specifies the cache where messages should be stored."
      },
      {
        "name": "CacheLookupTimeoutInSeconds",
        "doc": "Specifies the number of seconds after which an unsuccessful cache lookup will be considered a cache miss.",
        "default": "12"
      },
      {
        "name": "Scope",
        "doc": "Enumeration used to construct a prefix for a cache key when a <Prefix> element is not provided in the <CacheKey> element."
      },
      {
        "name": "AssignTo",
        "doc": "Specifies the variable where the cache entry is assigned after it has been retrieved from the cache.",
        "required": true
      }
    ]
  },
  "MessageLogging": {
    "name": "MessageLogging",
    "doc": "Defines a <MessageLogging> policy.",
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
    "doc": "Defines the MessageValidation policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Element",
        "doc": "Specifies the element in the message to validate.",
        "default": "sampleObject",
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
        "doc": "Identifies the source message to be validated.",
        "default": "request"
      },
      {
        "name": "ResourceURL",
        "doc": "Identifies the XSD schema or WSDL definition to be used to validate the source message.",
        "default": "wsdl://display_name.wsdl"
      },
      {
        "name": "Properties"
      }
    ]
  },
  "MonetizationLimitsCheck": {
    "name": "MonetizationLimitsCheck",
    "doc": "Defines the MonetizationLimitsCheck policy.",
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
                "name": "source",
                "doc": "Specifies the source object of the copy. If source is not specified, it is treated as a simple message. For example, if the policy is in the request flow, then the source defaults to the request object. If the policy is in the response…"
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
    "doc": "Defines the OpenAPI Specification Validation policy.",
    "children": [
      {
        "name": "OASResource",
        "doc": "Specifies the OpenAPI Specification to validate against.",
        "required": true
      },
      {
        "name": "Options",
        "doc": "Configures options for the policy.",
        "children": [
          {
            "name": "ValidateMessageBody",
            "doc": "Specifies whether the policy should validate the message body against the operation's request body schema in the OpenAPI Specification.",
            "values": [
              "true",
              "false"
            ],
            "default": "false"
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
        "doc": "JSON message to be evaluated against JSON payload attacks.",
        "default": "request"
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
        "name": "Operation",
        "doc": "<Operation>GenerateAuthorizationCode</Operation> The OAuth 2.0 operation executed by the policy."
      },
      {
        "name": "AppEndUser",
        "doc": "<AppEndUser>request.queryparam.app_enduser</AppEndUser> In cases where the app end user ID must be sent to the authorization server, this element lets you specify where Apigee should look for the end user ID."
      },
      {
        "name": "UserName",
        "doc": "<UserName>request.queryparam.user_name</UserName> This element is used with the password grant type only."
      },
      {
        "name": "PassWord",
        "doc": "<PassWord>request.queryparam.password</PassWord> This element is used with the password grant type only."
      },
      {
        "name": "GrantType",
        "doc": "<GrantType>request.queryparam.grant_type</GrantType> Tells the policy where to find the grant type parameter that is passed in a request."
      },
      {
        "name": "ClientId",
        "doc": "<ClientId>request.formparam.client_id</ClientId> In several cases, the client app must send the client ID to the authorization server."
      },
      {
        "name": "SupportedGrantTypes",
        "children": [
          {
            "name": "GrantType",
            "doc": "<GrantType>request.queryparam.grant_type</GrantType> Tells the policy where to find the grant type parameter that is passed in a request."
          }
        ]
      },
      {
        "name": "ExpiresIn",
        "doc": "<ExpiresIn>10000</ExpiresIn> Enforces the expiry time of access tokens and authorization codes in milliseconds."
      },
      {
        "name": "GenerateResponse",
        "doc": "<GenerateResponse enabled='true'/> If set to true or if the enabled attribute is omitted, the policy generates and returns a response.",
        "values": [
          "true",
          "false"
        ],
        "default": "true"
      },
      {
        "name": "AccessToken",
        "doc": "<AccessToken>request.header.access_token</AccessToken> By default, when Operation is VerifyAccessToken, the policy expects the access token to be sent in the Authorization header as a bearer token; that is to say, with a prefix of…"
      },
      {
        "name": "AccessTokenPrefix",
        "doc": "<AccessTokenPrefix>Prefix</AccessTokenPrefix> By default, when Operation is VerifyAccessToken, the policy expects the access token to be sent in the Authorization header as a bearer token; that is to say, with a prefix of \"Bearer\",…",
        "default": "-none-"
      },
      {
        "name": "Scope",
        "doc": "<Scope>request.queryparam.scope</Scope> If this element is present in one of the GenerateAccessToken or GenerateAuthorizationCode policies, it is used to specify which scopes to grant the token or code."
      },
      {
        "name": "Algorithm",
        "values": [
          "HS256",
          "HS384",
          "HS512",
          "RS256",
          "RS384",
          "RS512"
        ]
      },
      {
        "name": "CacheExpiryInSeconds",
        "doc": "<CacheExpiryInSeconds ref=\"propertyset.settings.token-ttl\">60</CacheExpiryInSeconds> This element can be used with the VerifyAccessToken operation only."
      },
      {
        "name": "Code",
        "doc": "<Code>request.queryparam.code</Code> In the authorization grant type flow, the client must submit an authorization code to the authorization server (Apigee)."
      },
      {
        "name": "ExternalAccessToken",
        "doc": "<ExternalAccessToken>request.queryparam.external_access_token</ExternalAccessToken> Tells Apigee where to find an external access token (an access token not generated by Apigee)."
      },
      {
        "name": "ExternalAuthorization",
        "doc": "<ExternalAuthorization>true</ExternalAuthorization> If this element is false or not present, then Apigee validates the client_id and client_secret normally against the Apigee authorization store.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "ExternalAuthorizationCode",
        "doc": "<ExternalAuthorizationCode>request.queryparam.external_auth_code</ExternalAuthorizationCode> Tells Apigee where to find an external auth code (an auth code not generated by Apigee)."
      },
      {
        "name": "ExternalRefreshToken",
        "doc": "<ExternalRefreshToken>request.queryparam.external_refresh_token</ExternalRefreshToken> Tells Apigee where to find an external refresh token (a refresh token not generated by Apigee)."
      },
      {
        "name": "GenerateErrorResponse",
        "doc": "<GenerateErrorResponse enabled='true'/> If set to true, the policy generates and returns a response if the ContinueOnError attribute is set to true.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "RedirectUri",
        "doc": "<RedirectUri>request.queryparam.redirect_uri</RedirectUri> Specifies where Apigee should look for the redirect_uri parameter in the request."
      },
      {
        "name": "RefreshToken",
        "doc": "<RefreshToken>request.queryparam.refreshtoken</RefreshToken> When requesting an access token using a refresh token, you must supply the refresh token in the request."
      },
      {
        "name": "RefreshTokenExpiresIn",
        "doc": "<RefreshTokenExpiresIn>1000</RefreshTokenExpiresIn> Enforces the expiry time of refresh tokens in milliseconds."
      },
      {
        "name": "ResponseType",
        "doc": "<ResponseType>request.queryparam.response_type</ResponseType> This element informs Apigee which grant type the client app is requesting."
      },
      {
        "name": "ReuseRefreshToken",
        "doc": "<ReuseRefreshToken>true</ReuseRefreshToken> When set to true, the existing refresh token is reused until it expires.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "RFCCompliantRequestResponse",
        "doc": "<RFCCompliantRequestResponse>[true | false]</RFCCompliantRequestResponse> The OAuthV2 policy, with the GenerateAccessToken operation, can return a response that is not compliant with the related IETF OAuth 2.0 specifications, including…",
        "values": [
          "true",
          "false"
        ]
      },
      {
        "name": "State",
        "doc": "<State>request.queryparam.state</State> In cases where the client app must send the state information to the authorization server, this element lets you specify where Apigee should look for the state values."
      },
      {
        "name": "StoreToken",
        "doc": "<StoreToken>true</StoreToken> Set this element to true when the <ExternalAuthorization> element is true.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      }
    ]
  },
  "ParsePayload": {
    "name": "ParsePayload",
    "doc": "Specifies validation parsing properties applied toward application logic evaluation cycles.",
    "children": [
      {
        "name": "Source",
        "doc": "Indicates the request/response container context processed immediately through runtime evaluations."
      },
      {
        "name": "PayloadType",
        "doc": "Governs overall evaluation structures recognized regarding data processing requirements."
      },
      {
        "name": "Protocol",
        "doc": "Determines formatting behaviors corresponding precisely with target interface declarations."
      }
    ]
  },
  "PopulateCache": {
    "name": "PopulateCache",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "CacheKey",
        "doc": "Configures a unique pointer to a piece of data stored in the cache.",
        "required": true,
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
        "name": "CacheResource",
        "doc": "Specifies the cache where messages should be stored."
      },
      {
        "name": "Scope",
        "doc": "Enumeration used to construct a prefix for a cache key when a <Prefix> element is not provided in the <CacheKey> element."
      },
      {
        "name": "ExpirySettings",
        "doc": "Specifies when a cache entry should expire.",
        "required": true,
        "children": [
          {
            "name": "TimeoutInSeconds"
          }
        ]
      },
      {
        "name": "Source",
        "doc": "Specifies the variable whose value should be written to the cache.",
        "required": true
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
        "required": true,
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
        ],
        "default": "False"
      }
    ]
  },
  "PublishMessage": {
    "name": "PublishMessage",
    "doc": "Specifies the PublishMessage policy.",
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
        "required": true,
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
        "required": true,
        "children": [
          {
            "name": "Topic",
            "doc": "Specifies the Pub/Sub topic to which you want to publish the <Source> message.",
            "required": true
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
        ],
        "default": "False"
      },
      {
        "name": "UseMessageAsSource",
        "doc": "Specifies the message to publish."
      }
    ]
  },
  "PythonScript": {
    "name": "PythonScript",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "ResourceURL",
        "doc": "This element specifies the main Python file that will execute in the API flow.",
        "required": true
      },
      {
        "name": "IncludeURL",
        "doc": "Specifies a Python file to be loaded as dependency to the main Python file specified with the <ResourceURL> element."
      }
    ]
  },
  "Quota": {
    "name": "Quota",
    "doc": "Following are attributes and child elements of <Quota>.",
    "attrs": [
      {
        "name": "type",
        "doc": "Sets the Quota policy type, which determines when and how the quota counter checks quota usage as well as how it resets.",
        "values": [
          "calendar",
          "rollingwindow",
          "flexi"
        ]
      }
    ],
    "children": [
      {
        "name": "Interval",
        "doc": "Specifies the number of time periods in which quotas are calculated.",
        "required": true,
        "attrs": [
          {
            "name": "ref",
            "doc": "Use to specify a flow variable containing the interval for a quota."
          }
        ]
      },
      {
        "name": "TimeUnit",
        "doc": "Specifies the unit of time applicable to the quota.",
        "required": true,
        "attrs": [
          {
            "name": "ref",
            "doc": "Specifies a flow variable containing the time unit for a quota."
          }
        ]
      },
      {
        "name": "Allow",
        "doc": "Specifies the count limit for the quota. If the counter for the policy reaches this limit value, subsequent calls are rejected until the counter resets.",
        "attrs": [
          {
            "name": "count",
            "doc": "Use to specify a message count for the quota.",
            "default": "2000"
          },
          {
            "name": "countRef",
            "doc": "Use to specify a flow variable containing the message count for a quota."
          }
        ],
        "children": [
          {
            "name": "Class",
            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
            "attrs": [
              {
                "name": "ref",
                "doc": "Use to specify a flow variable containing the quota class for a quota.",
                "required": true
              }
            ],
            "children": [
              {
                "name": "Allow",
                "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                "attrs": [
                  {
                    "name": "class",
                    "doc": "Defines the name of the quota counter.",
                    "required": true
                  },
                  {
                    "name": "count",
                    "doc": "Specifies the quota limit for the counter.",
                    "required": true
                  }
                ],
                "repeatable": true,
                "children": [
                  {
                    "name": "Class",
                    "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                    "attrs": [
                      {
                        "name": "ref",
                        "doc": "Use to specify a flow variable containing the quota class for a quota.",
                        "required": true
                      }
                    ],
                    "children": [
                      {
                        "name": "Allow",
                        "doc": "Specifies the limit for a quota counter defined by the <Class> element.",
                        "attrs": [
                          {
                            "name": "class",
                            "doc": "Defines the name of the quota counter.",
                            "required": true
                          },
                          {
                            "name": "count",
                            "doc": "Specifies the quota limit for the counter.",
                            "required": true
                          }
                        ],
                        "children": [
                          {
                            "name": "Class",
                            "doc": "Lets you conditionalize the value of the <Allow> element based on the value of a flow variable.",
                            "attrs": [
                              {
                                "name": "ref",
                                "doc": "Use to specify a flow variable containing the quota class for a quota.",
                                "required": true
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
          }
        ]
      },
      {
        "name": "Identifier",
        "doc": "Configures the policy to create unique counters based on a flow variable.",
        "attrs": [
          {
            "name": "ref",
            "doc": "Specifies a flow variable that identifies the counter to use for the request."
          }
        ]
      },
      {
        "name": "StartTime",
        "doc": "When type is set to calendar, specifies the date and time when the quota counter begins counting, regardless of whether any requests have been received from any apps."
      },
      {
        "name": "SharedName",
        "doc": "Identifies this Quota policy as shared. All Quota policies in an API proxy with the same <SharedName> value share the same underlying quota counter."
      },
      {
        "name": "EnforceOnly",
        "doc": "Place a Quota policy with this element set to true in the request flow of an API proxy to enforce a quota without incrementing the quota counter.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "Distributed",
        "doc": "Determines whether Apigee uses one or more nodes to process requests.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "CountOnly",
        "doc": "Place a Quota policy with this element set to true in a step in the ProxyEndpoint response flow to increment the underlying quota counter without sending an error back to the client when the quota limit is exceeded.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "MessageWeight",
        "doc": "Specifies the weight assigned to each message for quota purposes.",
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Synchronous",
        "doc": "Determines whether to update a distributed quota counter synchronously.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "AsynchronousConfiguration",
        "doc": "Configures the synchronization interval among distributed quota counters when the policy configuration element <Synchronous> is either not present or present and set to false.",
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
        "name": "UseQuotaConfigInAPIProduct",
        "doc": "Defines quota settings for an API product, such as the time units, interval, and allowed maximum.",
        "attrs": [
          {
            "name": "stepName",
            "doc": "Identifies the name of the authentication policy in the flow.",
            "required": true
          }
        ],
        "children": [
          {
            "name": "DefaultConfig",
            "doc": "Contains default values for an API product's quota."
          }
        ]
      }
    ]
  },
  "RaiseFault": {
    "name": "RaiseFault",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "(Optional) Ignores any unresolved variable error in the Flow."
      },
      {
        "name": "FaultResponse",
        "doc": "(Optional) Defines the response message returned to the requesting client.",
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "ShortFaultReason",
        "doc": "Specifies to display a short fault reason in the response:",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      }
    ]
  },
  "ReadPropertySet": {
    "name": "ReadPropertySet",
    "doc": "Defines a ReadPropertySet policy.",
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
        "doc": "Determines whether processing stops when a property set is unresolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      }
    ]
  },
  "RegularExpressionProtection": {
    "name": "RegularExpressionProtection",
    "children": [
      {
        "name": "Source",
        "doc": "Indicates the message from which information needs to be extracted."
      },
      {
        "name": "JSONPayload",
        "doc": "Specifies that information needs to be extracted from a JSON payload and evaluated against the regular expressions provided.",
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
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether the policy returns an error when it encounters a variable that is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "FormParam",
        "doc": "Specifies that information needs to be extracted from the request form parameter and evaluated against the regular expressions provided.",
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "URIPath",
        "doc": "Specifies that information needs to be extracted from the request URI path and evaluated against the regular expressions provided.",
        "children": [
          {
            "name": "Pattern",
            "repeatable": true
          }
        ]
      },
      {
        "name": "QueryParam",
        "doc": "Specifies that information needs to be extracted from the request query parameter and evaluated against the regular expressions provided.",
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
        "doc": "Specifies that information needs to be extracted from the request and response headers and evaluated against the regular expressions provided.",
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
        "doc": "Specifies that information needs to be extracted from the given variable and evaluated against the regular expressions provided.",
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
        "doc": "Specifies that information needs to be extracted from an XML payload and evaluated against the regular expressions provided.",
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
        "doc": "Identifies the target Quota policy whose counter should be updated.",
        "required": true,
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      }
    ]
  },
  "ResponseCache": {
    "name": "ResponseCache",
    "children": [
      {
        "name": "CacheKey",
        "doc": "Configures a unique pointer to a piece of data stored in the cache.",
        "required": true,
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
        "doc": "Specifies when a cache entry should expire.",
        "required": true,
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
        "name": "SkipCacheLookup",
        "doc": "Defines an expression that, if it evaluates to true at runtime, specifies that cache lookup should be skipped and the cache should be refreshed."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Properties"
      },
      {
        "name": "Scope",
        "doc": "Enumeration used to construct a prefix for a cache key when a <Prefix> element is not provided in the <CacheKey> element."
      },
      {
        "name": "CacheResource",
        "doc": "Specifies the cache where messages should be stored."
      },
      {
        "name": "CacheLookupTimeoutInSeconds",
        "doc": "Specifies the number of seconds after which an unsuccessful cache lookup will be considered a cache miss.",
        "default": "30"
      },
      {
        "name": "ExcludeErrorResponse",
        "doc": "This policy can cache HTTP responses with any status code.",
        "values": [
          "true",
          "false"
        ],
        "default": "true"
      },
      {
        "name": "SkipCachePopulation",
        "doc": "Defines an expression that, if it evaluates to true at runtime, specifies that a write to the cache should be skipped."
      },
      {
        "name": "UseAcceptHeader",
        "doc": "Set to true to have a response cache entry's cache key appended with values from response Accept headers.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "UseResponseCacheHeaders",
        "doc": "Set to true to have HTTP response headers considered when setting the \"time to live\" (TTL) of the response in the cache.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      }
    ]
  },
  "SanitizeModelResponse": {
    "name": "SanitizeModelResponse",
    "doc": "Defines a SanitizeModelResponse policy.",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
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
            "doc": "The Model Armor template.",
            "required": true
          }
        ]
      },
      {
        "name": "UserPromptSource",
        "required": true
      },
      {
        "name": "LLMResponseSource",
        "required": true
      },
      {
        "name": "FunctionCallSource",
        "doc": "The location of the function call arguments to extract from the model response."
      },
      {
        "name": "TemplateName",
        "doc": "The Model Armor template.",
        "required": true
      }
    ]
  },
  "SanitizeUserPrompt": {
    "name": "SanitizeUserPrompt",
    "doc": "Defines a SanitizeUserPrompt policy.",
    "children": [
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "ModelArmor",
        "doc": "Contains the required information for specifying the Model Armor template.",
        "required": true,
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
    "doc": "Defines a SemanticCacheLookup policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
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
            "required": true,
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to generate text embeddings. See Supported models for a list of models that provide text embeddings for the SemanticCacheLookup policy.",
                "required": true
              }
            ]
          }
        ]
      },
      {
        "name": "SimilaritySearch",
        "doc": "This element contains the information required to perform similarity searches.",
        "required": true,
        "children": [
          {
            "name": "VertexAI",
            "doc": "Contains the Vertex AI-specific attributes used to perform the similarity search.",
            "required": true,
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to generate text embeddings. See Supported models for a list of models that provide text embeddings for the SemanticCacheLookup policy.",
                "required": true
              },
              {
                "name": "DeployedIndexID"
              },
              {
                "name": "Threshold"
              },
              {
                "name": "DistanceMeasureType"
              }
            ]
          }
        ]
      }
    ]
  },
  "SemanticCachePopulate": {
    "name": "SemanticCachePopulate",
    "doc": "Defines a SemanticCachePopulate policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when a variable is unresolved.",
        "values": [
          "true",
          "false"
        ],
        "default": "False"
      },
      {
        "name": "SimilaritySearch",
        "doc": "Element containing the information required to update the vector index.",
        "required": true,
        "children": [
          {
            "name": "VertexAI",
            "doc": "Contains the <URL> element for Vertex AI-specific attributes.",
            "required": true,
            "children": [
              {
                "name": "URL",
                "doc": "The URL used to upsert datapoints in the vector index.",
                "required": true
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Request",
        "doc": "Specifies the variable containing the request message that gets sent from the API proxy to the other service.",
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
        "name": "Response",
        "doc": "Include this element when the API proxy logic requires the response from the remote call for further processing."
      },
      {
        "name": "Timeout",
        "doc": "The time in milliseconds that the ServiceCallout policy will wait for a response from the target."
      },
      {
        "name": "HTTPTargetConnection",
        "doc": "Provides transport details such as URL, TLS/SSL, and HTTP properties.",
        "required": true,
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
        "doc": "Specifies a local proxy -- that is, a proxy in the same organization and environment -- as the target of service callouts.",
        "required": true,
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
    "doc": "Specifies the SetIntegrationRequest policy.",
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
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "ApiTrigger",
        "doc": "Specifies the API trigger to run.",
        "required": true,
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
        "attrs": [
          {
            "name": "substitutionVariableChar",
            "doc": "Lets you set custom delimiters to pass flow variable values as template arguments in the <Parameter> child element."
          }
        ],
        "children": [
          {
            "name": "Parameter",
            "doc": "Specifies an input parameter.",
            "attrs": [
              {
                "name": "name",
                "doc": "Name of the parameter."
              },
              {
                "name": "type",
                "doc": "Data type of the parameter. The supported types are integer, string, boolean, double, and json."
              },
              {
                "name": "ref",
                "doc": "Specifies the flow variable from which Apigee should read the parameter value."
              }
            ]
          },
          {
            "name": "ParameterArray",
            "doc": "Specifies an input parameter array.",
            "attrs": [
              {
                "name": "name",
                "doc": "Name of the parameter array."
              },
              {
                "name": "type",
                "doc": "Data type of the parameter array. The supported types are integer, string, boolean, and double."
              },
              {
                "name": "ref",
                "doc": "Specifies the flow variable from which Apigee should read the array values."
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
        "doc": "Specifies the flow variable name for saving the request.",
        "default": "request"
      }
    ]
  },
  "SetOAuthV2Info": {
    "name": "SetOAuthV2Info",
    "children": [
      {
        "name": "AccessToken",
        "doc": "Identifies the variable where the access token is located.",
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "Attributes",
        "doc": "A set of attributes in the access token profile that will be modified or augmented.",
        "required": true,
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
    "doc": "Defines the SpikeArrest policy.",
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
        "required": true,
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
    "doc": "Defines the TraceCapture policy.",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, more natural-sounding name."
      },
      {
        "name": "Variables",
        "doc": "Specifies the list of variables to trace.",
        "required": true,
        "children": [
          {
            "name": "Variable",
            "doc": "Specifies the variables to be added in the trace data.",
            "required": true,
            "attrs": [
              {
                "name": "name",
                "doc": "A name for referencing the data collected for the specified variable."
              },
              {
                "name": "ref",
                "doc": "The variable for which you are collecting the trace data."
              }
            ],
            "repeatable": true
          }
        ]
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "Determines whether processing stops when an unresolved variable is encountered.",
        "values": [
          "true",
          "false"
        ]
      },
      {
        "name": "ThrowExceptionOnLimit",
        "doc": "Specifies the behavior of the policy when the size of the variable exceeds the limit of 256 bytes.",
        "values": [
          "true",
          "false"
        ]
      }
    ]
  },
  "VerifyAPIKey": {
    "name": "VerifyAPIKey",
    "children": [
      {
        "name": "APIKey",
        "doc": "This element specifies the flow variable that contains the API key.",
        "required": true,
        "attrs": [
          {
            "name": "ref"
          }
        ]
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "CacheExpiryInSeconds",
        "doc": "This element enforces TTL on the cache, which enables customization of the time period for cached API key expiration.",
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
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "CredentialSource",
        "doc": "<CredentialSource>flow_variable_name_containing_credential_value</CredentialSource> This element specifies the flow variable containing the credential value, and has these characteristics:"
      }
    ]
  },
  "VerifyJWS": {
    "name": "VerifyJWS",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the Apigee UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Algorithm",
        "doc": "<Algorithm>HS256</Algorithm> Specifies the encryption algorithm to sign the token.",
        "values": [
          "HS256",
          "HS384",
          "HS512",
          "RS256",
          "RS384",
          "RS512",
          "ES256",
          "ES384",
          "ES512",
          "PS256",
          "PS384",
          "PS512"
        ],
        "required": true
      },
      {
        "name": "Source",
        "doc": "<Source>JWS-variable</Source> If present, specifies the flow variable in which the policy expects to find the JWS to verify."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "<IgnoreUnresolvedVariables>true|false</IgnoreUnresolvedVariables> Set to false if you want the policy to throw an error when any referenced variable specified in the policy is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "SecretKey",
        "doc": "<SecretKey encoding=\"base16|hex|base64|base64url\" > <Value ref=\"private.your-variable-name\"/> </SecretKey> Specifies the secret key to use when verifying a JWS that uses a symmetric (HS*) algorithm, one of HS256, HS384, or HS512.",
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
        "name": "DetachedContent",
        "doc": "<DetachedContent>variable-name-here</DetachedContent> A generated JWS with a content payload is in the form:"
      },
      {
        "name": "IgnoreCriticalHeaders",
        "doc": "<IgnoreCriticalHeaders>true|false</IgnoreCriticalHeaders> Set to false if you want the policy to throw an error when any header listed in the crit header of the JWS is not listed in the <KnownHeaders> element.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "KnownHeaders",
        "doc": "<KnownHeaders>a,b,c</KnownHeaders> or: <KnownHeaders ref='variable_containing_headers'/> The GenerateJWS policy uses the <CriticalHeaders> element to populate the crit header in a token."
      },
      {
        "name": "Type",
        "doc": "<Type>type-string-here</Type> Optional element whose only allowed value is Signed, specifying that the policy verifies a signed JWS."
      }
    ]
  },
  "VerifyJWT": {
    "name": "VerifyJWT",
    "children": [
      {
        "name": "DisplayName",
        "doc": "<DisplayName>Policy Display Name</DisplayName> Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Algorithm",
        "doc": "<Algorithm>HS256</Algorithm> Specifies the cryptographic algorithm used to verify the token.",
        "values": [
          "HS256",
          "HS384",
          "HS512",
          "RS256",
          "RS384",
          "RS512",
          "ES256",
          "ES384",
          "ES512",
          "PS256",
          "PS384",
          "PS512"
        ],
        "required": true
      },
      {
        "name": "Source",
        "doc": "<Source>jwt-variable</Source> If present, specifies the flow variable in which the policy expects to find the JWT to verify."
      },
      {
        "name": "IgnoreUnresolvedVariables",
        "doc": "<IgnoreUnresolvedVariables>true|false</IgnoreUnresolvedVariables> Set to false if you want the policy to throw an error when any referenced variable specified in the policy is unresolvable.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "SecretKey",
        "doc": "<SecretKey encoding=\"base16|hex|base64|base64url\" > <Value ref=\"private.your-variable-name\"/> </SecretKey> The SecretKey element is optional.",
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
        "name": "Subject",
        "doc": "<VerifyJWT name='VJWT-8'> ... <!-- verify that the sub claim matches a hard-coded value --> <Subject>subject-string-here</Subject> or: <!-- verify that the sub claim matches the value contained in a variable --> <Subject…"
      },
      {
        "name": "Issuer",
        "doc": "<VerifyJWT name='VJWT-29'> ... <!-- verify that the iss claim matches a hard-coded value --> <Issuer>issuer-string-here</Issuer> or: <!-- verify that the iss claim matches the value contained in a variable --> <Issuer…"
      },
      {
        "name": "Audience",
        "doc": "<Audience>audience-here</Audience> or: <Audience ref='variable-name-here'/> The policy verifies that the audience claim in the JWT matches the value specified in the configuration."
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
        "doc": "Specifies the source for the public key used to verify a JWT signed with an asymmetric algorithm.",
        "children": [
          {
            "name": "Value",
            "doc": "<PrivateKey> <Value ref=\"private.variable-name-here\"/> </PrivateKey> Child of the <PrivateKey> element.",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Certificate",
            "doc": "<PublicKey> <Certificate ref=\"signed_public.cert\"/> </PublicKey> -or- <PublicKey> <Certificate> -----BEGIN CERTIFICATE----- certificate data -----END CERTIFICATE----- </Certificate> </PublicKey> A child of the <PublicKey> element."
          },
          {
            "name": "JWKS",
            "doc": "<PublicKey> <JWKS &hellip; > &hellip; </JWKS> </PublicKey> A child of the <PublicKey> element."
          }
        ]
      },
      {
        "name": "Algorithms",
        "doc": "<Algorithms> <Key>key-algorithm</Key> <Content>content-algorithm</Content> </Algorithm> Use the <Algorithms> element to verify an encrypted JWT.",
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
        "name": "Type",
        "doc": "<Type>type-string-here</Type> Describes whether the policy verifies a signed JWT or an encrypted JWT."
      },
      {
        "name": "PrivateKey",
        "doc": "Use this element to specify the private key that can be used to verify a JWT encrypted with an asymmetric algorithm.",
        "children": [
          {
            "name": "Value",
            "doc": "<PrivateKey> <Value ref=\"private.variable-name-here\"/> </PrivateKey> Child of the <PrivateKey> element.",
            "attrs": [
              {
                "name": "ref"
              }
            ]
          },
          {
            "name": "Password",
            "doc": "<PrivateKey> <Password ref=\"private.privatekey-password\"/> </PrivateKey> A child of the <PrivateKey> element."
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
        "name": "TimeAllowance",
        "doc": "<VerifyJWT name='VJWT-23'> ... <!-- configure a hard-coded time allowance of 20 seconds --> <TimeAllowance>20s</TimeAllowance> or: <!-- refer to a variable containing the time allowance --> <TimeAllowance…"
      },
      {
        "name": "RequiredClaims",
        "doc": "<VerifyJWT name='VJWT-1'> ... <!-- Directly specify the names of the claims to require --> <RequiredClaims>sub,iss,exp</RequiredClaims> -or- <!-- Specify the claim names indirectly, via a context variable --> <RequiredClaims…",
        "repeatable": true
      },
      {
        "name": "CustomClaims",
        "doc": "Note: Currently, a CustomClaims element is inserted when you add a new GenerateJWT policy through the UI."
      },
      {
        "name": "Id",
        "doc": "<Id>explicit-jti-value-here</Id> -or- <Id ref='variable-name-here'/> -or- <Id/> Verifies that the JWT has the specific jti claim."
      },
      {
        "name": "IgnoreCriticalHeaders",
        "doc": "<IgnoreCriticalHeaders>true|false</IgnoreCriticalHeaders> Set to false if you want the policy to throw an error when any header listed in the crit header of the JWT is not listed in the <KnownHeaders> element.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "IgnoreIssuedAt",
        "doc": "<IgnoreIssuedAt>true|false</IgnoreIssuedAt> Set to false (default) if you want the policy to throw an error when a JWT contains an iat (Issued at) claim that specifies a time in the future.",
        "values": [
          "true",
          "false"
        ],
        "default": "false"
      },
      {
        "name": "KnownHeaders",
        "doc": "<KnownHeaders>a,b,c</KnownHeaders> or: <KnownHeaders ref='variable_containing_headers'/> The GenerateJWT policy uses the <CriticalHeaders> element to populate the crit header in a JWT."
      },
      {
        "name": "MaxLifespan",
        "doc": "<VerifyJWT name='VJWT-62'> ... <!-- hard-coded lifespan of 5 minutes --> <MaxLifespan>5m</MaxLifespan> or: <!-- refer to a variable --> <MaxLifespan ref='variable-here'/> or: <!-- attribute telling the policy to use iat rather than nbf…"
      }
    ]
  },
  "XMLThreatProtection": {
    "name": "XMLThreatProtection",
    "children": [
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "NameLimits",
        "doc": "Specifies character limits to be checked and enforced by the policy.",
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
        "name": "Source",
        "doc": "Message to be screened for XML payload attacks.",
        "default": "request"
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
        "doc": "Specifies character limits for values to be checked and enforced by the policy.",
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
      },
      {
        "name": "StructuralLimits",
        "doc": "Specifies structural limits to be checked and enforced by the policy."
      }
    ]
  },
  "XMLToJSON": {
    "name": "XMLToJSON",
    "children": [
      {
        "name": "Options",
        "doc": "Options give you control over the conversion from XML to JSON.",
        "children": [
          {
            "name": "RecognizeNumber",
            "doc": "If true, then number fields in the XML payload retain their original format.",
            "values": [
              "true",
              "false"
            ],
            "default": "false"
          },
          {
            "name": "RecognizeBoolean",
            "doc": "Lets the conversion maintain boolean true/false values rather than turning the values into strings.",
            "values": [
              "true",
              "false"
            ],
            "default": "false"
          },
          {
            "name": "RecognizeNull",
            "doc": "Lets you convert empty values to null values.",
            "values": [
              "true",
              "false"
            ],
            "default": "false"
          },
          {
            "name": "NullValue",
            "doc": "Indicates the value to which recognized null values in the source message should be converted.",
            "default": "null"
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
            "name": "StripLevels",
            "doc": "<Options> <StripLevels>4</StripLevels> </Options> Sometimes XML payloads, such as SOAP, have many parent levels you don't want to include in the converted JSON."
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
        "name": "OutputVariable",
        "doc": "Specifies where to store the output of the XML to JSON format conversion."
      },
      {
        "name": "Source",
        "doc": "The variable specifying the XML message that you want to convert to JSON."
      },
      {
        "name": "DisplayName",
        "doc": "Use in addition to the name attribute to label the policy in the management UI proxy editor with a different, natural-language name."
      },
      {
        "name": "Format",
        "doc": "Format gives you control over the conversion from XML to JSON."
      }
    ]
  },
  "XSL": {
    "name": "XSL",
    "doc": "Defines an XSLTransform policy.",
    "children": [
      {
        "name": "ResourceURL",
        "doc": "The XSL file that Apigee uses for transforming the message.",
        "required": true
      },
      {
        "name": "Source",
        "doc": "Specifies the message that is transformed."
      },
      {
        "name": "OutputVariable",
        "doc": "A variable that stores the output of the transformation."
      },
      {
        "name": "Parameters",
        "doc": "Adds support for the <xsl:param> element in your stylesheets.",
        "attrs": [
          {
            "name": "ignoreUnresolvedVariables",
            "doc": "Determines if the policy ignores any unresolved variable errors in the XSLT script instructions."
          }
        ],
        "children": [
          {
            "name": "Parameter",
            "doc": "Defines a parameter in the <Parameters> element.",
            "attrs": [
              {
                "name": "name",
                "doc": "The name of the parameter. Apigee matches the value you set here with the value of the name attribute on an <xsl:param> element in the stylesheet. For example, if you enter a name of uid, your XSL might look something like the following:…"
              },
              {
                "name": "ref",
                "doc": "Points to a context variable that holds the value for the parameter."
              },
              {
                "name": "value",
                "doc": "Specifies a hard-coded value for the parameter."
              }
            ]
          }
        ]
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
  "PythonScript": "python-script-policy",
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
